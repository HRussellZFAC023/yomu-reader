(function() {
"use strict";
function isBookwalkerViewerHost(hostname = location.hostname) {
  return hostname === "bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
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
function isPromiseLike$1(value) {
  return Boolean(value && typeof value.then === "function");
}
function promiseWithTimeout(promise, timeoutMs, message) {
  let timeoutId = 0;
  const timeout = new Promise((_resolve, reject) => {
  timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([
  promise,
  timeout
  ]).finally(() => window.clearTimeout(timeoutId));
}
const FURIGANA_HIDE_STATE_GROUPS = ["known", "due", "failed", "learning", "new"];
const APP_NAME = "よむ";
const ACADEMY_SRS_LABEL = "Academy";
const DOCS_ORIGIN = "https://yomureader.com";
const DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
const YOMU_HOSTED_AUDIO_URL = "https://audio.yomureader.com/?term={term}&reading={reading}";
const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
const SUPPORT_COPY = "よむ is a free userscript for popup lookup, dictionaries, OCR, subtitles, study, and Anki.";
const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
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
  // Retired Uchisen carousel index. Keep the prefix registered so Factory
  // Reset still removes harmless selection keys left by older releases.
  { owner: "dictionaries/uchisen-carousel (retired)", kind: "gm", prefix: "yomu-jpdb-uchisen-index:" },
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
const AREA_MARKER_KEYS = {
  local: "yomu:web-storage-epoch:v1:local",
  session: "yomu:web-storage-epoch:v1:session"
};
const managedLocalStorage = managedStorageFacade("local");
const managedSessionStorage = managedStorageFacade("session");
function managedStorageFacade(area) {
  return {
  getItem(key) {
    const { storage: storage2, epoch } = certifiedArea();
    const raw = readStorageValue(storage2, physicalStorageKey(key, epoch), `${area}Storage key "${key}"`);
    if (raw === null || epoch.generation === 0) return raw;
    try {
      const unreadable = Symbol("unreadable-managed-web-storage");
      const value = managedStateLogicalValue(JSON.parse(raw), epoch, unreadable);
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    assertManagedLogicalKey(key);
    const { storage: storage2, epoch } = certifiedArea();
    const stored = epoch.generation === 0 ? value : JSON.stringify(managedStateStoredValue(value, epoch));
    writeAndVerify(storage2, physicalStorageKey(key, epoch), stored, `${area}Storage key "${key}"`);
    assertAreaCertificate(area, epoch);
  },
  removeItem(key) {
    assertManagedLogicalKey(key);
    const { storage: storage2, epoch } = certifiedArea();
    const physicalKey = physicalStorageKey(key, epoch);
    removeStorageValue(storage2, physicalKey, `${area}Storage key "${key}"`);
    if (readStorageValue(storage2, physicalKey, `${area}Storage key "${key}"`) !== null) {
      throw new Error(`${area}Storage retained managed key "${key}".`);
    }
    assertAreaCertificate(area, epoch);
  }
  };
}
function certifiedArea(area) {
  throw new Error("Managed web storage has not passed its epoch barrier.");
}
function assertAreaCertificate(area, epoch) {
  const marker = readStorageValue(storageArea(area), AREA_MARKER_KEYS[area], `${area}Storage epoch marker`);
  if (marker !== managedStateEpochToken(epoch)) {
  throw new Error(`${area}Storage is not certified for the captured managed-state epoch.`);
  }
}
function physicalStorageKey(key, epoch) {
  assertManagedLogicalKey(key);
  if (epoch.generation === 0) return key;
  return `${MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX}${encodeURIComponent(managedStateEpochToken(epoch))}:${encodeURIComponent(key)}`;
}
function assertManagedLogicalKey(key) {
  if (!isManagedStorageKey(key) || isManagedStorageSlotKey(key)) {
  throw new TypeError(`Managed web storage requires a logical Yomu key, received "${key}".`);
  }
}
function storageArea(area) {
  try {
  const storage2 = area === "local" ? localStorage : sessionStorage;
  if (!storage2) throw new Error(`${area}Storage is unavailable.`);
  return storage2;
  } catch (error) {
  throw new Error(`${area}Storage is unavailable.`, { cause: error });
  }
}
function readStorageValue(storage2, key, label) {
  try {
  return storage2.getItem(key);
  } catch (error) {
  throw new Error(`${label} could not be read.`, { cause: error });
  }
}
function writeAndVerify(storage2, key, value, label) {
  try {
  storage2.setItem(key, value);
  } catch (error) {
  throw new Error(`${label} could not be written.`, { cause: error });
  }
  if (readStorageValue(storage2, key, label) !== value) throw new Error(`${label} failed read-back verification.`);
}
function removeStorageValue(storage2, key, label) {
  try {
  storage2.removeItem(key);
  } catch (error) {
  throw new Error(`${label} could not be removed.`, { cause: error });
  }
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
function sanitizedStrandedLocalValue(key, value) {
  if (!isHostedYomuOrigin() || !isPlainRecord(value)) return value;
  ({ ...value });
  {
  return value;
  }
}
function localFallbackValueForWrite(key, value) {
  return value;
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
  const serialized = recoverableLocalStorageSerializedValue(key);
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
function recoverableLocalStorageSerializedValue(key) {
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
const ID_ATTR = "data-yomu-mid";
const MAX_OPS_PER_CANVAS = 6e3;
const PRUNE_KEEP = 3e3;
const MAX_REBUILD_DEPTH = 6;
const RELOAD_GUARD_KEY = "yomu:bw:mirror-loadguard";
const RELOAD_GUARD_WINDOW_MS = 8e3;
const RELOAD_GUARD_LIMIT = 4;
let recorderLoadGuardChecked = false;
let recorderLoopBroken = false;
let recorderInstallRetryTimer = 0;
let recorderInstallRetryCount = 0;
let recorderInstallDOMContentLoadedHooked = false;
const RECORDER_INSTALL_RETRY_DELAYS_MS = [0, 16, 50, 150, 400, 1e3];
const lastMirrorTargetSyncEpoch = /* @__PURE__ */ new Map();
const mirrorContentSummaryCache = /* @__PURE__ */ new Map();
function recorderReloadLoopDetected() {
  if (recorderLoadGuardChecked) return recorderLoopBroken;
  recorderLoadGuardChecked = true;
  try {
  const now = Date.now();
  const prev = JSON.parse(managedSessionStorage.getItem(RELOAD_GUARD_KEY) || "null");
  const next = prev && now - prev.at < RELOAD_GUARD_WINDOW_MS ? { n: prev.n + 1, at: prev.at } : { n: 1, at: now };
  managedSessionStorage.setItem(RELOAD_GUARD_KEY, JSON.stringify(next));
  recorderLoopBroken = next.n > RELOAD_GUARD_LIMIT;
  if (recorderLoopBroken) {
    attemptVoid(() => console.warn("[Yomu] BookWalker reload loop detected — disabling the OCR recorder injection for this load. Reload manually to retry."), "canvas-mirror.recorderReloadLoopDetected");
  }
  } catch {
  recorderLoopBroken = false;
  }
  return recorderLoopBroken;
}
const EPOCH_ATTR = "data-yomu-mirror-epoch";
const MARKER_ATTR = "data-yomu-mirror-recorder";
const METHOD_ATTR = "data-yomu-mirror-method";
const DUMP_ATTR = "data-yomu-mirror-dump";
const REQUEST_ATTR = "data-yomu-mirror-request";
const SUMMARY_REQUEST_PREFIX = "summary:";
const PULL_EVENT = "yomu-canvas-mirror-pull";
const MIRROR_TOKEN_CONTRACT_VERSION = 3;
function pageWindow() {
  return globalThis;
}
function state() {
  const win = pageWindow();
  return win.__yomuCanvasMirror ??= { seq: 0, nextId: 1, installed: false, records: /* @__PURE__ */ Object.create(null) };
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
function selectLatestReplayOps(ops, beforeSeq) {
  let replaySeq = beforeSeq;
  for (let index = ops.length - 1; index >= 0; index--) {
  const op = ops[index];
  if (op.seq >= replaySeq) continue;
  if (op.clear) {
    replaySeq = op.seq;
    continue;
  }
  break;
  }
  return selectLatestContentOpsBefore(ops, replaySeq);
}
function selectLatestContentOpsBefore(ops, beforeSeq) {
  const byDest = /* @__PURE__ */ new Map();
  for (const op of ops) {
  if (op.seq >= beforeSeq) continue;
  if (op.clear) {
    byDest.clear();
    continue;
  }
  byDest.set(destKey(op), op);
  }
  return [...byDest.values()].sort((a, b) => a.seq - b.seq);
}
function collectLeafUrls(id, beforeSeq, lookup, out = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set(), depth = 0) {
  if (!id || depth > MAX_REBUILD_DEPTH || seen.has(id)) return out;
  const record2 = lookup(id);
  if (!record2) return out;
  const next = new Set(seen).add(id);
  for (const op of selectLatestReplayOps(record2.ops, beforeSeq)) {
  if (op.srcOps?.length) collectLeafUrlsFromSnapshot(op.srcOps, lookup, out, next, depth + 1);
  else if (op.srcId) {
    const before = out.size;
    collectLeafUrls(op.srcId, op.seq, lookup, out, next, depth + 1);
    if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
      collectLeafUrls(op.srcId, Number.POSITIVE_INFINITY, lookup, out, next, depth + 1);
    }
  } else if (op.url) out.add(op.url);
  }
  return out;
}
function collectLeafUrlsFromSnapshot(ops, lookup, out, seen, depth) {
  if (depth > MAX_REBUILD_DEPTH) return out;
  for (const op of selectLatestReplayOps(ops, Number.POSITIVE_INFINITY)) {
  if (op.srcOps?.length) collectLeafUrlsFromSnapshot(op.srcOps, lookup, out, seen, depth + 1);
  else if (op.srcId) {
    const before = out.size;
    collectLeafUrls(op.srcId, op.seq, lookup, out, seen, depth + 1);
    if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
      collectLeafUrls(op.srcId, Number.POSITIVE_INFINITY, lookup, out, seen, depth + 1);
    }
  } else if (op.url) out.add(op.url);
  }
  return out;
}
function shouldUseLatestSourceFallback(id, beforeSeq, lookup) {
  if (!Number.isFinite(beforeSeq)) return false;
  const record2 = lookup(id);
  if (!record2?.ops.length) return false;
  return !record2.ops.some((op) => !op.clear && op.seq < beforeSeq);
}
function collectLeafContentFingerprints(id, beforeSeq, lookup, out = /* @__PURE__ */ new Set(), seen = /* @__PURE__ */ new Set(), depth = 0) {
  if (!id || depth > MAX_REBUILD_DEPTH || seen.has(id)) return out;
  const record2 = lookup(id);
  if (!record2) return out;
  const next = new Set(seen).add(id);
  for (const op of selectLatestReplayOps(record2.ops, beforeSeq)) {
  if (op.srcOps?.length) {
    collectLeafContentFingerprintsFromSnapshot(op.srcOps, lookup, out, next, depth + 1);
  } else if (op.srcId) {
    const before = out.size;
    collectLeafContentFingerprints(op.srcId, op.seq, lookup, out, next, depth + 1);
    if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
      collectLeafContentFingerprints(op.srcId, Number.POSITIVE_INFINITY, lookup, out, next, depth + 1);
    }
  } else if (op.url) {
    out.add([
      canonicalBookwalkerAssetUrl(op.url),
      op.sx,
      op.sy,
      op.sw,
      op.sh
    ].join(":"));
  }
  }
  return out;
}
function collectLeafContentFingerprintsFromSnapshot(ops, lookup, out, seen, depth) {
  if (depth > MAX_REBUILD_DEPTH) return out;
  for (const op of selectLatestReplayOps(ops, Number.POSITIVE_INFINITY)) {
  if (op.srcOps?.length) {
    collectLeafContentFingerprintsFromSnapshot(op.srcOps, lookup, out, seen, depth + 1);
  } else if (op.srcId) {
    const before = out.size;
    collectLeafContentFingerprints(op.srcId, op.seq, lookup, out, seen, depth + 1);
    if (out.size === before && shouldUseLatestSourceFallback(op.srcId, op.seq, lookup)) {
      collectLeafContentFingerprints(op.srcId, Number.POSITIVE_INFINITY, lookup, out, seen, depth + 1);
    }
  } else if (op.url) {
    out.add([
      canonicalBookwalkerAssetUrl(op.url),
      op.sx,
      op.sy,
      op.sw,
      op.sh
    ].join(":"));
  }
  }
  return out;
}
function markSkip(context) {
  if (context) context.__yomuMirrorSkip = true;
  return context;
}
function markCanvasMirrorSkip(context) {
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
function rebuildById(id, beforeSeq, images, canvases, seen, depth, lookup) {
  if (depth > MAX_REBUILD_DEPTH || seen.has(id)) return null;
  const record2 = lookup(id);
  if (!record2 || !record2.w || !record2.h) return null;
  const ops = selectLatestReplayOps(record2.ops, beforeSeq);
  if (!ops.length) return null;
  const out = document.createElement("canvas");
  out.width = record2.w;
  out.height = record2.h;
  const ctx = markSkip(out.getContext("2d", { willReadFrequently: true }));
  if (!ctx) return null;
  seen.add(id);
  let drew = 0;
  for (const op of ops) {
  let source = null;
  if (op.srcOps?.length && op.srcW && op.srcH) {
    source = rebuildSnapshotSource(op.srcOps, op.srcW, op.srcH, images, canvases, new Set(seen), depth + 1, lookup);
  } else if (op.srcId) {
    source = rebuildById(op.srcId, op.seq, images, canvases, new Set(seen), depth + 1, lookup) ?? (shouldUseLatestSourceFallback(op.srcId, op.seq, lookup) ? rebuildById(op.srcId, Number.POSITIVE_INFINITY, images, canvases, new Set(seen), depth + 1, lookup) : null) ?? canvases.get(op.srcId) ?? null;
  } else if (op.url) source = images.get(op.url) ?? null;
  if (!source) continue;
  attemptVoid(() => {
    if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
    else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
    else ctx.drawImage(source, op.dx, op.dy);
    drew++;
  }, "canvas-mirror.rebuildById");
  }
  return drew ? out : null;
}
function rebuildSnapshotSource(ops, width, height, images, canvases, seen, depth, lookup) {
  if (depth > MAX_REBUILD_DEPTH || !width || !height) return null;
  const contentOps = selectLatestReplayOps(ops, Number.POSITIVE_INFINITY);
  if (!contentOps.length) return null;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = markSkip(out.getContext("2d", { willReadFrequently: true }));
  if (!ctx) return null;
  let drew = 0;
  for (const op of contentOps) {
  let source = null;
  if (op.srcOps?.length && op.srcW && op.srcH) {
    source = rebuildSnapshotSource(op.srcOps, op.srcW, op.srcH, images, canvases, new Set(seen), depth + 1, lookup);
  } else if (op.srcId) {
    source = rebuildById(op.srcId, op.seq, images, canvases, new Set(seen), depth + 1, lookup) ?? (shouldUseLatestSourceFallback(op.srcId, op.seq, lookup) ? rebuildById(op.srcId, Number.POSITIVE_INFINITY, images, canvases, new Set(seen), depth + 1, lookup) : null) ?? canvases.get(op.srcId) ?? null;
  } else if (op.url) {
    source = images.get(op.url) ?? null;
  }
  if (!source) continue;
  attemptVoid(() => {
    if (op.sw >= 0) ctx.drawImage(source, op.sx, op.sy, op.sw, op.sh, op.dx, op.dy, op.dw, op.dh);
    else if (op.dw >= 0) ctx.drawImage(source, op.dx, op.dy, op.dw, op.dh);
    else ctx.drawImage(source, op.dx, op.dy);
    drew++;
  }, "canvas-mirror.rebuildSnapshotSource");
  }
  return drew ? out : null;
}
function pullPageMirrorRecords(target = state(), scope) {
  const requestedId = typeof scope === "string" ? scope : scope ? canvasId(scope) ?? "" : "";
  const parsed = requestPageMirrorPayload(requestedId);
  if (!parsed?.records) return false;
  mergeMirrorPayloadMetadata(target, parsed);
  if (requestedId) {
  let copied = false;
  for (const [id, record2] of Object.entries(parsed.records)) {
    target.records[id] = record2;
    copied = true;
  }
  if (!copied) delete target.records[requestedId];
  lastMirrorTargetSyncEpoch.set(requestedId, canvasMirrorTurnToken());
  } else {
  target.records = parsed.records;
  lastMirrorTargetSyncEpoch.clear();
  }
  return true;
}
let summaryBridgeContractMismatch = false;
function pullPageMirrorContentSummary(id, target = state()) {
  const parsed = requestPageMirrorPayload(`${SUMMARY_REQUEST_PREFIX}${id}`);
  if (!parsed) return "";
  mergeMirrorPayloadMetadata(target, parsed);
  if (parsed.tv !== MIRROR_TOKEN_CONTRACT_VERSION) {
  summaryBridgeContractMismatch = true;
  mirrorContentSummaryCache.delete(id);
  return "";
  }
  const token = parsed.summaries?.[id] ?? "";
  const epoch = canvasMirrorTurnToken();
  if (token) mirrorContentSummaryCache.set(id, { epoch, token });
  else mirrorContentSummaryCache.delete(id);
  return token;
}
function requestPageMirrorPayload(request) {
  try {
  const root = document.documentElement;
  if (!root || !recorderMarkerPresent()) return null;
  if (request) root.setAttribute(REQUEST_ATTR, request);
  else root.removeAttribute(REQUEST_ATTR);
  try {
    root.dispatchEvent(new CustomEvent(PULL_EVENT));
  } finally {
    if (request) root.removeAttribute(REQUEST_ATTR);
  }
  const text = root.querySelector("[" + DUMP_ATTR + "]")?.textContent;
  if (!text) return null;
  return JSON.parse(text);
  } catch {
  return null;
  }
}
function mergeMirrorPayloadMetadata(target, parsed) {
  if (typeof parsed.seq === "number") target.seq = Math.max(target.seq, parsed.seq);
  if (typeof parsed.nextId === "number") target.nextId = Math.max(target.nextId, parsed.nextId);
  if (typeof parsed.epoch === "number") target.epoch = parsed.epoch;
}
function canvasMirrorTurnToken() {
  return attempt(() => document.documentElement?.getAttribute(EPOCH_ATTR) ?? "", "", "canvas-mirror.canvasMirrorTurnToken");
}
function canvasMirrorContentToken(canvas) {
  const id = canvasId(canvas);
  if (!id) return "";
  const s = state();
  const epoch = canvasMirrorTurnToken();
  if (recorderMarkerPresent() && !summaryBridgeContractMismatch) {
  const cachedSummary = mirrorContentSummaryCache.get(id);
  if (cachedSummary && (!epoch || cachedSummary.epoch === epoch)) return cachedSummary.token;
  const summary = pullPageMirrorContentSummary(id, s);
  if (summary) return summary;
  }
  if (!s.records[id]?.ops.length || epoch && lastMirrorTargetSyncEpoch.get(id) !== epoch) {
  pullPageMirrorRecords(s, id);
  }
  return mirrorContentTokenForRecords(id, (key) => s.records[key]);
}
function operationContentFingerprint(id, record2) {
  const ops = selectLatestReplayOps(record2.ops, Number.POSITIVE_INFINITY);
  if (!ops.length) return "";
  return [
  id,
  record2.w,
  record2.h,
  ...ops.map((op) => [
    op.srcId ?? "",
    canonicalBookwalkerAssetUrl(op.url),
    op.sx,
    op.sy,
    op.sw,
    op.sh,
    op.dx,
    op.dy,
    op.dw,
    op.dh
  ].join(":"))
  ].join("|");
}
function canonicalBookwalkerAssetUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
  const url = new URL(rawUrl, location.href);
  if (isBookwalkerAssetHost(url.hostname)) {
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isVolatileSignedUrlParam(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
  }
  return url.toString();
  } catch {
  return rawUrl;
  }
}
function isBookwalkerAssetHost(hostname) {
  return hostname === "bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
}
function isVolatileSignedUrlParam(key) {
  const lower = key.toLowerCase();
  return lower === "policy" || lower === "signature" || lower === "key-pair-id" || lower === "expires" || lower.startsWith("x-amz-");
}
async function captureCanvasMirror(canvas, loadCleanImage) {
  installCanvasMirrorRecorder();
  const s = state();
  const id = canvasId(canvas);
  if (id && recorderMarkerPresent()) pullPageMirrorRecords(s, id);
  const records = id ? snapshotMirrorRecordGraph(id, s.records) : /* @__PURE__ */ Object.create(null);
  const lookup = (key) => records[key];
  const urls = id ? collectLeafUrls(id, Number.POSITIVE_INFINITY, lookup) : /* @__PURE__ */ new Set();
  const contentToken = id ? mirrorContentTokenForRecords(id, lookup) : "";
  const images = /* @__PURE__ */ new Map();
  if (urls.size) {
  await Promise.all([...urls].map(async (url) => {
    try {
      const image = await loadCleanImage(url);
      if (image) images.set(url, image);
    } catch {
    }
  }));
  if (images.size !== urls.size) return void 0;
  }
  const canvases = new Map(
  Array.from(document.querySelectorAll(`canvas[${ID_ATTR}]`)).map((source) => [source.getAttribute(ID_ATTR) ?? "", source]).filter(([sourceId]) => sourceId)
  );
  const rebuilt = id ? rebuildById(id, Number.POSITIVE_INFINITY, images, canvases, /* @__PURE__ */ new Set(), 0, lookup) : null;
  if (rebuilt && contentToken) rebuilt.dataset.yomuMirrorContentToken = contentToken;
  return rebuilt && isReadable(rebuilt) ? rebuilt : void 0;
}
function snapshotMirrorRecordGraph(rootId, source) {
  const snapshot = /* @__PURE__ */ Object.create(null);
  const visitRecord = (id, depth) => {
  if (depth > MAX_REBUILD_DEPTH || snapshot[id]) return;
  const record2 = source[id];
  if (!record2) return;
  const ops = record2.ops.map(cloneMirrorOp);
  snapshot[id] = { w: record2.w, h: record2.h, ops };
  visitOps(ops, depth + 1);
  };
  const visitOps = (ops, depth) => {
  if (depth > MAX_REBUILD_DEPTH) return;
  for (const op of ops) {
    if (op.srcId) visitRecord(op.srcId, depth);
    if (op.srcOps?.length) visitOps(op.srcOps, depth + 1);
  }
  };
  visitRecord(rootId, 0);
  return snapshot;
}
function cloneMirrorOp(op) {
  return {
  ...op,
  ...op.srcOps ? { srcOps: op.srcOps.map(cloneMirrorOp) } : {}
  };
}
function mirrorContentTokenForRecords(id, lookup) {
  const content = collectLeafContentFingerprints(id, Number.POSITIVE_INFINITY, lookup);
  if (content.size) return `m:${mirrorTokenHash([...content].sort().join(""))}`;
  const record2 = lookup(id);
  const fingerprint = record2 ? operationContentFingerprint(id, record2) : "";
  return fingerprint ? `o:${mirrorTokenHash(fingerprint)}` : "";
}
function mirrorTokenHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
  hash ^= value.charCodeAt(index);
  hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
function recorderBootstrap(win, opts) {
  if (win.__yomuCanvasMirrorRecorder) return;
  const HC = win.HTMLCanvasElement;
  const OC = win.OffscreenCanvas;
  const w2 = win;
  if (!w2.CanvasRenderingContext2D?.prototype && !w2.OffscreenCanvasRenderingContext2D?.prototype) return;
  const ATTR = opts.a, MAX = opts.m, KEEP = opts.k;
  const S = win.__yomuCanvasMirror = win.__yomuCanvasMirror || { seq: 0, nextId: 1, installed: false, epoch: 0, records: /* @__PURE__ */ Object.create(null) };
  const doc = win.document;
  const root = doc && doc.documentElement;
  let lastDrawUrl = "";
  const bumpEpoch = (el) => {
  if (el && el.nodeType && !el.isConnected) return;
  S.epoch = (S.epoch || 0) + 1;
  if (root) {
    try {
      root.setAttribute(opts.e, String(S.epoch));
    } catch {
    }
  }
  };
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
  const dKey = (op) => op.dx + "," + op.dy + "," + op.dw + "," + op.dh;
  const latestOpsBefore = (ops, beforeSeq) => {
  const byDest = /* @__PURE__ */ new Map();
  for (const op of ops) {
    if (op.seq >= beforeSeq) continue;
    if (op.clear) {
      byDest.clear();
      continue;
    }
    byDest.set(dKey(op), op);
  }
  return Array.from(byDest.values()).sort((a, b) => a.seq - b.seq);
  };
  const latestOps = (ops, beforeSeq) => {
  let replaySeq = beforeSeq;
  for (let index = ops.length - 1; index >= 0; index--) {
    const op = ops[index];
    if (!op || op.seq >= replaySeq) continue;
    if (op.clear) {
      replaySeq = op.seq;
      continue;
    }
    break;
  }
  return latestOpsBefore(ops, replaySeq);
  };
  const snapshotOps = (id, beforeSeq, depth) => {
  if (!id || depth > 4) return [];
  const sourceRecord = S.records[id];
  if (!sourceRecord) return [];
  return latestOps(sourceRecord.ops, beforeSeq).map((sourceOp) => {
    const copy = { ...sourceOp };
    if (sourceOp.srcId) {
      const nestedRecord = S.records[sourceOp.srcId];
      if (nestedRecord) {
        copy.srcW = nestedRecord.w;
        copy.srcH = nestedRecord.h;
        const nested = snapshotOps(sourceOp.srcId, sourceOp.seq, depth + 1);
        if (nested.length) copy.srcOps = nested;
      }
    }
    return copy;
  });
  };
  const addSnapshotDependencies = (ops, out, seen, depth) => {
  if (depth > 6) return;
  for (const op of ops) {
    if (op.srcOps?.length) addSnapshotDependencies(op.srcOps, out, seen, depth + 1);
    else if (op.srcId) addRecordClosure(op.srcId, out, seen, depth + 1);
  }
  };
  const addRecordClosure = (id, out, seen, depth) => {
  if (!id || seen[id] || depth > 6) return;
  const record2 = S.records[id];
  if (!record2) return;
  seen[id] = true;
  out[id] = record2;
  addSnapshotDependencies(record2.ops, out, seen, depth + 1);
  };
  const requestedRecords = (id) => {
  if (!id) return S.records;
  const out = /* @__PURE__ */ Object.create(null);
  addRecordClosure(id, out, /* @__PURE__ */ Object.create(null), 0);
  return out;
  };
  const volatileSignedParam = (key) => {
  const lower = key.toLowerCase();
  return lower === "policy" || lower === "signature" || lower === "key-pair-id" || lower === "expires" || lower.startsWith("x-amz-");
  };
  const canonicalUrl = (raw) => {
  if (!raw) return "";
  try {
    const url = new URL(raw, win.location?.href || doc?.location?.href || "");
    if (url.hostname === "bookwalker.jp" || url.hostname.endsWith(".bookwalker.jp")) {
      url.hash = "";
      for (const key of Array.from(url.searchParams.keys())) {
        if (volatileSignedParam(key)) url.searchParams.delete(key);
      }
      url.searchParams.sort();
    }
    return url.toString();
  } catch {
    return raw;
  }
  };
  const hashText = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
  };
  const leafFingerprint = (op) => [
  canonicalUrl(op.url),
  op.sx,
  op.sy,
  op.sw,
  op.sh
  ].join(":");
  const shouldUseLatestSource = (id, beforeSeq) => {
  if (!Number.isFinite(beforeSeq)) return false;
  const record2 = S.records[id];
  if (!record2?.ops.length) return false;
  return !record2.ops.some((op) => !op.clear && op.seq < beforeSeq);
  };
  const addSourceLeafFingerprints = (id, beforeSeq, out, seen, depth) => {
  const before = Object.keys(out).length;
  addLeafFingerprints(id, beforeSeq, out, seen, depth);
  if (Object.keys(out).length === before && shouldUseLatestSource(id, beforeSeq)) {
    addLeafFingerprints(id, Number.POSITIVE_INFINITY, out, seen, depth);
  }
  };
  const addLeafFingerprintsFromOps = (ops, out, seen, depth) => {
  if (depth > 6) return;
  for (const op of latestOps(ops, Number.POSITIVE_INFINITY)) {
    if (op.srcOps?.length) addLeafFingerprintsFromOps(op.srcOps, out, seen, depth + 1);
    else if (op.srcId) addSourceLeafFingerprints(op.srcId, op.seq, out, seen, depth + 1);
    else if (op.url) out[leafFingerprint(op)] = true;
  }
  };
  const addLeafFingerprints = (id, beforeSeq, out, seen, depth) => {
  if (!id || seen[id] || depth > 6) return;
  const record2 = S.records[id];
  if (!record2) return;
  const nextSeen = { ...seen, [id]: true };
  for (const op of latestOps(record2.ops, beforeSeq)) {
    if (op.srcOps?.length) addLeafFingerprintsFromOps(op.srcOps, out, nextSeen, depth + 1);
    else if (op.srcId) addSourceLeafFingerprints(op.srcId, op.seq, out, nextSeen, depth + 1);
    else if (op.url) out[leafFingerprint(op)] = true;
  }
  };
  const operationSummaryToken = (id, record2) => {
  const ops = latestOps(record2.ops, Number.POSITIVE_INFINITY);
  if (!ops.length) return "";
  const payload = [
    id,
    record2.w,
    record2.h,
    ...ops.map((op) => [
      op.srcId || "",
      canonicalUrl(op.url),
      op.sx,
      op.sy,
      op.sw,
      op.sh,
      op.dx,
      op.dy,
      op.dw,
      op.dh
    ].join(":"))
  ].join("|");
  return `o:${hashText(payload)}`;
  };
  const summaryToken = (id) => {
  const record2 = S.records[id];
  if (!record2) return "";
  const ops = record2.ops;
  const stamp = ops.length + ":" + (ops.length ? ops[ops.length - 1].seq : -1);
  if (record2.tokStamp === stamp && typeof record2.tok === "string") return record2.tok;
  const leafs = /* @__PURE__ */ Object.create(null);
  addLeafFingerprints(id, Number.POSITIVE_INFINITY, leafs, /* @__PURE__ */ Object.create(null), 0);
  const keys = Object.keys(leafs).sort();
  const token = keys.length ? `m:${hashText(keys.join(""))}` : operationSummaryToken(id, record2);
  record2.tok = token;
  record2.tokStamp = stamp;
  return token;
  };
  const requestedSummaries = (id) => {
  const out = /* @__PURE__ */ Object.create(null);
  if (!id) return out;
  const token = summaryToken(id);
  if (token) out[id] = token;
  return out;
  };
  const patch = (p) => {
  if (!p) return false;
  if (p.__yomuMirrorPatched) return true;
  p.__yomuMirrorPatched = true;
  const draw = p.drawImage;
  p.drawImage = function(src) {
    if (!this.__yomuMirrorSkip) {
      try {
        const cid = idOf(this.canvas, true);
        if (cid) {
          const r = rec(cid, this.canvas.width, this.canvas.height);
          const a = arguments;
          const sourceId = isCanvas(src) ? idOf(src, true) : null;
          const o = { seq: S.seq++, srcId: sourceId, url: sourceId ? "" : srcUrl(src), sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: false };
          if (sourceId) {
            const sourceRecord = S.records[sourceId];
            if (sourceRecord) {
              o.srcW = sourceRecord.w;
              o.srcH = sourceRecord.h;
              const snapshot = snapshotOps(sourceId, o.seq, 0);
              if (snapshot.length) o.srcOps = snapshot;
            }
          }
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
          if (o.srcId) bumpEpoch(this.canvas);
          else if (o.url && o.url !== lastDrawUrl) {
            lastDrawUrl = o.url;
            bumpEpoch(this.canvas);
          }
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
          if (cid) {
            rec(cid, this.canvas.width, this.canvas.height).ops.push({ seq: S.seq++, srcId: null, url: "", sx: 0, sy: 0, sw: -1, sh: -1, dx: 0, dy: 0, dw: -1, dh: -1, clear: true });
            bumpEpoch(this.canvas);
          }
        }
      } catch {
      }
    }
    return clr.apply(this, arguments);
  };
  return true;
  };
  const patchedCanvas = patch(w2.CanvasRenderingContext2D?.prototype);
  const patchedOffscreen = patch(w2.OffscreenCanvasRenderingContext2D?.prototype);
  const patched = patchedCanvas || patchedOffscreen;
  if (!patched) return;
  win.__yomuCanvasMirrorRecorder = true;
  S.installed = true;
  if (doc && root) {
  try {
    root.setAttribute(opts.r, "1");
  } catch {
  }
  try {
    root.addEventListener(opts.p, () => {
      try {
        let node = root.querySelector("[" + opts.d + "]");
        if (!node) {
          const created = doc.createElement("div");
          created.setAttribute(opts.d, "1");
          created.style.display = "none";
          root.appendChild(created);
          node = created;
        }
        const requestAttr = opts.q || "data-yomu-mirror-request";
        const request = root.getAttribute(requestAttr) || "";
        if (request.indexOf("summary:") === 0) {
          node.textContent = JSON.stringify({ summaries: requestedSummaries(request.slice("summary:".length)), seq: S.seq, nextId: S.nextId, epoch: S.epoch || 0, tv: opts.v || 0 });
        } else {
          node.textContent = JSON.stringify({ records: requestedRecords(request), seq: S.seq, nextId: S.nextId, epoch: S.epoch || 0 });
        }
      } catch {
      }
    });
  } catch {
  }
  }
}
function recorderOpts() {
  return {
  a: ID_ATTR,
  m: MAX_OPS_PER_CANVAS,
  k: PRUNE_KEEP,
  e: EPOCH_ATTR,
  d: DUMP_ATTR,
  q: REQUEST_ATTR,
  p: PULL_EVENT,
  r: MARKER_ATTR,
  v: MIRROR_TOKEN_CONTRACT_VERSION
  };
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
  return recorderMarkerPresent() || Boolean(pageWindow().__yomuCanvasMirror?.installed);
}
function installRecorderThroughUnsafeWindow(opts) {
  const win = userscriptUnsafeWindow();
  if (!win) return false;
  try {
  recorderBootstrap(win, opts);
  } catch {
  return false;
  }
  return recorderMarkerPresent() || recorderWindowInstalled(win);
}
function userscriptUnsafeWindow() {
  const uw = globalThis.unsafeWindow;
  if (!uw || uw === globalThis) return null;
  return uw;
}
function scheduleRecorderInstallRetry(hostname) {
  if (recorderInstallRetryTimer) return;
  const delay = RECORDER_INSTALL_RETRY_DELAYS_MS[Math.min(recorderInstallRetryCount, RECORDER_INSTALL_RETRY_DELAYS_MS.length - 1)] ?? 1e3;
  recorderInstallRetryCount += 1;
  recorderInstallRetryTimer = window.setTimeout(() => {
  recorderInstallRetryTimer = 0;
  installCanvasMirrorRecorder(hostname);
  }, delay);
  if (!recorderInstallDOMContentLoadedHooked && document.readyState === "loading") {
  recorderInstallDOMContentLoadedHooked = true;
  document.addEventListener("DOMContentLoaded", () => {
    if (recorderAlreadyInstalled()) return;
    if (recorderInstallRetryTimer) window.clearTimeout(recorderInstallRetryTimer);
    recorderInstallRetryTimer = 0;
    installCanvasMirrorRecorder(hostname);
  }, { once: true });
  }
}
function recorderMarkerPresent() {
  return attempt(() => document.documentElement?.getAttribute(MARKER_ATTR) === "1", false, "canvas-mirror.recorderMarkerPresent");
}
function recorderAlreadyInstalled() {
  if (recorderMarkerPresent()) return true;
  const uw = userscriptUnsafeWindow();
  return (uw ? recorderWindowInstalled(uw) : false) || recorderWindowInstalled(pageWindow());
}
function recorderWindowInstalled(win) {
  return attempt(() => Boolean(win.__yomuCanvasMirror?.installed), false, "canvas-mirror.recorderWindowInstalled");
}
function likelyUserscriptContentSandbox() {
  const g = globalThis;
  return Boolean(g.unsafeWindow && g.unsafeWindow !== globalThis) || Boolean(g.GM_info || g.GM || g.GM_xmlhttpRequest);
}
function markRecorderMethod(method) {
  attemptVoid(() => document.documentElement?.setAttribute(METHOD_ATTR, method), "canvas-mirror.markRecorderMethod");
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
  if (!isBookwalkerViewerHost(hostname)) return;
  if (recorderAlreadyInstalled()) return;
  if (recorderReloadLoopDetected()) return;
  if (!document.head && !document.documentElement) {
  scheduleRecorderInstallRetry(hostname);
  return;
  }
  const opts = recorderOpts();
  if (injectRecorderIntoPage(opts)) {
  markRecorderMethod("script");
  return;
  }
  if (document.readyState === "loading") {
  scheduleRecorderInstallRetry(hostname);
  return;
  }
  if (!likelyUserscriptContentSandbox() && installRecorderThroughUnsafeWindow(opts)) {
  markRecorderMethod("unsafeWindow");
  return;
  }
  if (likelyUserscriptContentSandbox()) return;
  const s = state();
  if (s.installed) return;
  recorderBootstrap(pageWindow(), opts);
  if (recorderAlreadyInstalled()) markRecorderMethod("current");
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
const UNIFIED_IDEOGRAPH_RUN_RE = /\p{Unified_Ideograph}+/gu;
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
const KATAKANA_MIDDLE_DOT = "・";
const COMBINING_KANA_MARKS = "゙゚";
const HIRAGANA_LETTERS = "ぁ-ゖゝ-ゟ";
const KATAKANA_LETTERS = "ァ-ヺヽ-ヿ";
const HALFWIDTH_KATAKANA_LETTERS = "ｦ-ｯｱ-ﾝ";
const KANJI_LIKE_PATTERN = `(?:${KANJI_PATTERN}|[${ITERATION_MARKS}])`;
const KANJI_LIKE_WITH_COUNTERS_PATTERN = `(?:${KANJI_PATTERN}|[${ITERATION_MARKS}${KANA_COUNTERS}])`;
const HIRAGANA_WITH_PROLONGED = `${HIRAGANA}${PROLONGED_SOUND_MARK}`;
const KATAKANA_WITH_PROLONGED = `${KATAKANA}${PROLONGED_SOUND_MARK}`;
const READING_KANA = `${KANA}${PROLONGED_SOUND_MARK}${KATAKANA_MIDDLE_DOT}`;
const JAPANESE_SCRIPT = `${KANA}${KANJI}${ITERATION_MARKS}${HALFWIDTH_KATAKANA}`;
const JAPANESE_LETTERS = `${HIRAGANA_LETTERS}${KATAKANA_LETTERS}${KANJI}${HALFWIDTH_KATAKANA_LETTERS}`;
const HAS_JAPANESE = new RegExp(`(?:[${JAPANESE_SCRIPT}]|${SUPPLEMENTARY_KANJI_PATTERN})`, "u");
const HAS_JAPANESE_LETTER = new RegExp(`(?:[${JAPANESE_LETTERS}]|${SUPPLEMENTARY_KANJI_PATTERN})`, "u");
const KANJI_RE = new RegExp(KANJI_PATTERN, "u");
const KANJI_LIKE_RE = new RegExp(KANJI_LIKE_PATTERN, "u");
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
const PITCH_CLASSES$1 = /* @__PURE__ */ new Set(["heiban", "atamadaka", "nakadaka", "odaka"]);
function tiledPitchComponents(card) {
  if (getPitchClass(card.pitchAccent, card.reading || card.spelling)) return null;
  const components = card.pitchComponents ?? [];
  if (components.length < 2) return null;
  if (compact(components.map((component) => component.spelling).join("")) !== compact(card.spelling)) return null;
  if (card.reading && compact(components.map((component) => component.reading).join("")) !== compact(card.reading)) return null;
  return components.map((component) => ({
  ...component,
  pitchClass: getPitchClass(component.pitchAccent, component.reading || component.spelling)
  }));
}
function pitchComponentUnderlineGradient(card) {
  const components = tiledPitchComponents(card);
  if (!components) return "";
  if (!components.some((component) => PITCH_CLASSES$1.has(component.pitchClass))) return "";
  const lengths = components.map((component) => Array.from(component.spelling).length);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return "";
  let offset = 0;
  const stops = [];
  components.forEach((component, index) => {
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
const JAPANESE_TEXT_RE = /[\u3040-\u30ff\u3400-\u9fff々〆]/u;
function normalizedJapaneseCardReading(spelling, reading) {
  const cleanSpelling = cleanCardHighlightValue(spelling);
  const cleanReading = cleanCardHighlightValue(reading);
  return cleanReading && JAPANESE_TEXT_RE.test(cleanReading) ? cleanReading : cleanSpelling;
}
function cleanCardHighlightValue(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
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
function publicDeinflectionCandidate(state2) {
  const { conditions: _conditions, ...candidate } = state2;
  return candidate;
}
function candidateKey(candidate) {
  return `${candidate.term}
${candidate.conditions}`;
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
const LEARNING_TARGET_MODULE_INTERFACE_VERSION = 10;
const SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS = [10];
function isSupportedLearningTargetModuleInterfaceVersion(value) {
  return SUPPORTED_LEARNING_TARGET_MODULE_INTERFACE_VERSIONS.includes(value);
}
const CORE_DELIVERED_CAPABILITIES = Object.freeze({
  "term-lookup": true,
  "character-lookup": true,
  segmentation: true,
  "reading-annotation": true,
  pronunciation: true,
  frequency: true,
  examples: true,
  audio: true,
  "text-to-speech": true,
  ocr: true,
  subtitles: true,
  typing: true,
  handwriting: true,
  mining: true,
  srs: true,
  grading: true
});
function learningTargetCapabilities(experiences, hasGrammarRules = false) {
  return Object.freeze({
  ...CORE_DELIVERED_CAPABILITIES,
  // A literal depth-0 dictionary candidate is lookup, not morphology.
  // Morphology is present only when a target owns deinflection, bounded
  // rewrite rules, or a target-specific subsegment Adapter.
  morphology: experiences.morphology !== "dictionary-forms",
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
  const experiences = learningTargetExperiences(spec);
  return Object.freeze({
  interfaceVersion: spec.interfaceVersion ?? LEARNING_TARGET_MODULE_INTERFACE_VERSION,
  id: spec.id,
  language,
  direction,
  collationLocale: spec.collationLocale ?? language,
  capabilities: learningTargetCapabilities(experiences, grammar.rules.length > 0),
  experiences,
  featureSemantics: Object.freeze({
    ...spec.featureSemantics,
    phoneticScripts: Object.freeze([...spec.featureSemantics.phoneticScripts])
  }),
  typography: Object.freeze({
    contentLocale: language,
    direction,
    readingAnnotationMode: "ruby",
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
    recordedWordAudio: false,
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
function learningTargetExperiences(spec) {
  return Object.freeze({
  characterLookup: "term-dictionary",
  morphology: morphologyExperience(spec),
  readingAnnotation: "dictionary-reading",
  frequency: "dictionary-rank-or-context-occurrences",
  audio: audioExperience(spec.audio?.recordedWordAudio ?? false),
  ocr: "target-locale",
  handwriting: "self-check",
  ...spec.experiences
  });
}
function morphologyExperience(spec) {
  return spec.experiences?.morphology ?? inferredMorphologyExperience(spec);
}
function inferredMorphologyExperience(spec) {
  if (spec.lookupCandidates) return "deinflection";
  return hasBoundedMorphology(spec) ? "bounded-rewrites" : "dictionary-forms";
}
function hasBoundedMorphology(spec) {
  if (spec.lookupRewrites?.length) return true;
  return Boolean(spec.lookupSubsegments);
}
function audioExperience(recordedWordAudio) {
  return recordedWordAudio ? "recorded-and-speech-synthesis" : "speech-synthesis";
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
  experiences: {
  characterLookup: "character-dictionary",
  morphology: "deinflection",
  audio: "recorded-and-speech-synthesis",
  handwriting: "stroke-feedback"
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
  templateLanguageToken: "ja",
  recordedWordAudio: true
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
const FOUNDATION_LEVEL = "Foundation";
const HSK_STANDARD_COURSE_LEVEL_SCALE = Object.freeze({
  id: "hsk-standard-course",
  levels: Object.freeze(["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6"])
});
const YEE_CEFR_BAND_LEVEL_SCALE = Object.freeze({
  id: "tr-yee-cefr-band",
  levels: Object.freeze(["A1–A2"])
});
function foundationScale(id) {
  return Object.freeze({ id, levels: Object.freeze([FOUNDATION_LEVEL]) });
}
function oneRuleGrammar(referenceUrl, levelScale, rule) {
  return createLearningTargetGrammar({ referenceUrl, levelScale, rules: [rule] });
}
function foundationGrammar(targetScaleId, referenceUrl, rule) {
  return oneRuleGrammar(referenceUrl, foundationScale(targetScaleId), {
  ...rule,
  level: FOUNDATION_LEVEL
  });
}
const ALBANIAN_EXISTENTIALS = "https://edizionicafoscari.unive.it/media/pdf/journals/balcania-et-slavia/2024/1/iss-4-1-2024.pdf#page=18";
const CLASSICAL_GREEK_ONLINE = "https://lrc.la.utexas.edu/eieol/grkol/0";
const MSA_NOMINAL_SENTENCES = "https://openbooks.lib.msu.edu/elemarabicll/chapter/grammar-2/";
const CUHK_CANTONESE_NEGATION = "https://www.cuhk.edu.hk/lin/cbrc/CantoneseGrammar/multimedia/13.htm";
const HSK_STANDARD_COURSE_3 = "https://www.hskstandardcourse.com/hsk-standard-course-level-3/";
const PRINCETON_YUELAIYUE = "https://commons.princeton.edu/chinesecharacters/%E8%B6%8A%E6%9D%A5%E8%B6%8A/";
const DANISH_PRESENTATIVE_DER = "https://ordnet.dk/ddo/ordbog/der";
const DUTCH_PRESENTATIVE_ER = "https://onzetaal.nl/taalloket/wel-of-geen-er";
const BRITISH_COUNCIL_THERE = "https://learnenglish.britishcouncil.org/free-resources/grammar/a1-a2/using-there-there-are";
const FINNISH_POSSESSION = "https://kielitoimistonohjepankki.fi/ohje/lauseenvastikkeet-tehdakseen-rakenne-pelaan-voittaakseni-rakenteen-tekija/";
const GREEK_NEGATION = "https://www.greek-language.gr/digitalResources/modern_greek/tools/lexica/glossology_edu/iframe.html?heading=2&id=173";
const HUNGARIAN_POSSESSION = "https://www.gutenberg.org/files/76725/76725-h/76725-h.htm";
const INDONESIAN_NEGATIVE_EXISTENTIAL = "https://seasite.niu.edu/flin/archive/103_handouts/sentences_and_phrases.htm";
const ITALIAN_PRESENTATIVE_CI = "https://www.treccani.it/enciclopedia/ci_%28La-grammatica-italiana%29/";
const KHMER_NEGATION = "https://seasite.niu.edu/khmer/grammar_note/grammar_note7/grammar_note7_text.htm";
const KOREAN_DESIRE = "https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=62657";
const LAO_NEGATION = "https://seasite.niu.edu/lao/LaoLanguage/grammar_notes/grammar2.htm";
const LATIN_NEGATIVE_COPULA = "https://www.usu.edu/markdamen/Latin1000/Presentation/transcriptions/04T.pdf";
const MONGOLIAN_NEGATION = "https://library.huree.edu.mn/data/201021/2023-05-19/An%20Elementary%20Mongolian%20Grammar%20%28%20PDFDrive.com%20%29.pdf";
const PERSIAN_NEGATIVE_COPULA = "https://sites.la.utexas.edu/persian_online_resources/verbs/long-copulas-1/";
const POLISH_NEGATIVE_EXISTENTIAL = "https://zpe.gov.pl/a/odmiana-rzeczownika-i-przymiotnika/D1DL299KT";
const PORTUGUESE_EXISTENTIAL_HAVER = "https://ciberduvidas.iscte-iul.pt/consultorio/perguntas/haverexistir/3409";
const ROMANIAN_NECESSITY = "https://slaviccenters.duke.edu/sites/slaviccenters.duke.edu/files/site-images/2016_romanian_verbs_conjugated.pdf";
const CROATIAN_EXISTENTIAL_NEMA = "https://bosnian.coerll.utexas.edu/c8/m2/lekcija1/grammar/";
const SWEDISH_PRESENTATIVE_FINNS = "https://svenska.se/grammatik/";
const TAGALOG_EXISTENTIALS = "https://seasite.niu.edu/trans/tagalog/Grammar%201/Sentences1/Existential_Sentences.htm";
const THAI_COPULAR_NEGATION = "https://seasite.niu.edu/thai/FLTH/1styearthai.htm";
const YEE_A1_A2 = "https://turkceninsesi.yee.org.tr/programlar/hayatin-icinden-turkce.";
const YEE_VAR_YOK = "https://turkceninsesi.yee.org.tr/programlar/hayatin-icinden4/hayatin-icinden4";
const VIETNAMESE_COMPLETION = "https://seasite.niu.edu/vietnamese/uniLesson8/L8_grammar.htm";
const FOUNDATION_GRAMMAR_BY_TARGET = Object.freeze({
  sq: foundationGrammar("sq-foundation", ALBANIAN_EXISTENTIALS, {
  ruleId: "sq-existential-ka-ketu",
  name: "Existence with ka … këtu",
  displayNames: { en: "Existence with ka … këtu", ja: "ka … këtu の存在文" },
  patternSource: String.raw`(?<!\p{L})[Kk]a\s+\p{L}+(?:-\p{L}+)?\s+këtu(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: ALBANIAN_EXISTENTIALS
  }),
  grc: foundationGrammar("grc-classical-foundation", CLASSICAL_GREEK_ONLINE, {
  ruleId: "grc-negation-ou",
  name: "Negation with οὐ",
  displayNames: { en: "Negation with οὐ", ja: "οὐ による否定" },
  patternSource: String.raw`(?<!\p{L})(?:[Οο]ὐ|[Οο]ὐκ|[Οο]ὐχ)(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: CLASSICAL_GREEK_ONLINE
  }),
  ar: foundationGrammar("ar-msa-foundation", MSA_NOMINAL_SENTENCES, {
  ruleId: "ar-msa-laysa-negation",
  name: "Nominal negation with laysa",
  displayNames: { en: "Nominal negation with laysa", ja: "laysa（ليس）による名詞文の否定" },
  patternSource: String.raw`(?<!\p{L})(?:ليس|ليست|لست|لسنا|لستم|لستن|ليسا|ليستا|ليسوا|لسن)(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: MSA_NOMINAL_SENTENCES
  }),
  yue: foundationGrammar("yue-foundation", CUHK_CANTONESE_NEGATION, {
  ruleId: "yue-copular-negation-m-haih",
  name: "Copular negation with 唔係",
  displayNames: { en: "Copular negation with 唔係", ja: "唔係 によるコピュラ否定" },
  patternSource: String.raw`唔係`,
  priority: 20,
  confidence: "high",
  url: CUHK_CANTONESE_NEGATION
  }),
  zh: oneRuleGrammar(HSK_STANDARD_COURSE_3, HSK_STANDARD_COURSE_LEVEL_SCALE, {
  ruleId: "zh-hsk3-yuelaiyue",
  level: "HSK 3",
  name: "Increasing degree with 越来越",
  displayNames: { en: "Increasing degree with 越来越", ja: "越来越 による程度変化" },
  patternSource: String.raw`(?:越来越|越來越)(?:冷|热|熱|好|忙|难|難|喜欢|喜歡|想)`,
  priority: 20,
  confidence: "high",
  url: PRINCETON_YUELAIYUE
  }),
  da: foundationGrammar("da-foundation", DANISH_PRESENTATIVE_DER, {
  ruleId: "da-presentative-der-er",
  name: "Presentative der er",
  displayNames: { en: "Presentative der er", ja: "der er の存在構文" },
  patternSource: String.raw`(?:^|(?<=[.!?…]\s))[Dd]er\s+er\s+(?:en|et|mange|ingen|to|tre|\d+)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: DANISH_PRESENTATIVE_DER
  }),
  nl: foundationGrammar("nl-foundation", DUTCH_PRESENTATIVE_ER, {
  ruleId: "nl-presentative-er-is-zijn",
  name: "Presentative er is / er zijn",
  displayNames: { en: "Presentative er is / er zijn", ja: "er is / er zijn の存在構文" },
  patternSource: String.raw`(?<!\p{L})[Ee]r\s+(?:is|zijn)\s+(?:een|geen|veel|twee|drie|\d+)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: DUTCH_PRESENTATIVE_ER
  }),
  en: oneRuleGrammar(BRITISH_COUNCIL_THERE, CEFR_GRAMMAR_LEVEL_SCALE, {
  ruleId: "en-a1-there-is-are",
  level: "A1",
  name: "Existence with there is / there are",
  displayNames: { en: "Existence with there is / there are", ja: "there is / there are の存在文" },
  patternSource: String.raw`(?<!\p{L})[Tt]here\s+(?:is|are)\s+(?:a|an|some|many|no|one|two|three|\d+)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: BRITISH_COUNCIL_THERE
  }),
  fi: foundationGrammar("fi-foundation", FINNISH_POSSESSION, {
  ruleId: "fi-adessive-possession",
  name: "Possession with adessive + on",
  displayNames: { en: "Possession with adessive + on", ja: "接格 ＋ on の所有文" },
  patternSource: String.raw`(?<!\p{L})(?:[Mm]inulla|[Ss]inulla|[Hh]änellä|[Mm]eillä|[Tt]eillä|[Hh]eillä)\s+on(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: FINNISH_POSSESSION
  }),
  el: foundationGrammar("el-modern-foundation", GREEK_NEGATION, {
  ruleId: "el-indicative-negation-den",
  name: "Indicative negation with δεν",
  displayNames: { en: "Indicative negation with δεν", ja: "δεν による直説法の否定" },
  patternSource: String.raw`(?<!\p{L})[Δδ]εν\s+\p{L}{2,}(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: GREEK_NEGATION
  }),
  hu: foundationGrammar("hu-foundation", HUNGARIAN_POSSESSION, {
  ruleId: "hu-dative-possession-van",
  name: "Possession with dative + van",
  displayNames: { en: "Possession with dative + van", ja: "与格 ＋ van の所有文" },
  patternSource: String.raw`(?<!\p{L})(?:[Nn]ekem|[Nn]eked|[Nn]eki|[Nn]ekünk|[Nn]ektek|[Nn]ekik)\s+van(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: HUNGARIAN_POSSESSION
  }),
  id: foundationGrammar("id-foundation", INDONESIAN_NEGATIVE_EXISTENTIAL, {
  ruleId: "id-negative-existential-tidak-ada",
  name: "Negative existence with tidak ada",
  displayNames: { en: "Negative existence with tidak ada", ja: "tidak ada の否定存在文" },
  patternSource: String.raw`(?<!\p{L})[Tt]idak\s+ada(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: INDONESIAN_NEGATIVE_EXISTENTIAL
  }),
  it: foundationGrammar("it-foundation", ITALIAN_PRESENTATIVE_CI, {
  ruleId: "it-presentative-ci",
  name: "Presentative c’è / ci sono",
  displayNames: { en: "Presentative c’è / ci sono", ja: "c’è / ci sono の存在構文" },
  patternSource: String.raw`(?<!\p{L})(?:[Cc][’']è|[Cc]i\s+sono)\s+(?:un|uno|una|due|tre|molti|molte|alcuni|alcune)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: ITALIAN_PRESENTATIVE_CI
  }),
  km: foundationGrammar("km-foundation", KHMER_NEGATION, {
  ruleId: "km-discontinuous-negation",
  name: "Discontinuous negation with មិន … ទេ",
  displayNames: { en: "Discontinuous negation with មិន … ទេ", ja: "មិន … ទេ の呼応否定" },
  patternSource: String.raw`មិន[^\n។៕!?]{1,50}?ទេ`,
  priority: 20,
  confidence: "high",
  url: KHMER_NEGATION
  }),
  ko: foundationGrammar("ko-foundation", KOREAN_DESIRE, {
  ruleId: "ko-desire-go-sipda",
  name: "Desire with -고 싶다",
  displayNames: { en: "Desire with -고 싶다", ja: "-고 싶다（希望）" },
  patternSource: String.raw`[가-힣]{1,8}고\s+싶(?:다|어요|습니다|어|었어요|었다|습니까|니|죠)(?![가-힣])`,
  priority: 20,
  confidence: "high",
  url: KOREAN_DESIRE
  }),
  lo: foundationGrammar("lo-foundation", LAO_NEGATION, {
  ruleId: "lo-preverbal-negation-bo",
  name: "Preverbal negation with ບໍ່",
  displayNames: { en: "Preverbal negation with ບໍ່", ja: "ບໍ່ による動詞・形容詞の否定" },
  patternSource: String.raw`ບໍ່\s*(?:ແມ່ນ|ໄປ|ມາ|ມັກ|ດີ|ງາມ|ຮູ້)`,
  priority: 20,
  confidence: "high",
  url: LAO_NEGATION
  }),
  la: foundationGrammar("la-classical-foundation", LATIN_NEGATIVE_COPULA, {
  ruleId: "la-negative-copula-non-est",
  name: "Negative copula with nōn est",
  displayNames: { en: "Negative copula with nōn est", ja: "nōn est によるコピュラ否定" },
  patternSource: String.raw`(?<!\p{L})[Nn][oō]n\s+est(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: LATIN_NEGATIVE_COPULA
  }),
  mn: foundationGrammar("mn-khalkha-foundation", MONGOLIAN_NEGATION, {
  ruleId: "mn-nominal-negation-bish",
  name: "Nominal negation with биш",
  displayNames: { en: "Nominal negation with биш", ja: "биш による名詞文の否定" },
  patternSource: String.raw`(?<!\p{L})биш(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: MONGOLIAN_NEGATION
  }),
  fa: foundationGrammar("fa-iranian-foundation", PERSIAN_NEGATIVE_COPULA, {
  ruleId: "fa-negative-long-copula",
  name: "Negative long copula",
  displayNames: { en: "Negative long copula", ja: "否定長形コピュラ نیست" },
  patternSource: String.raw`(?<!\p{L})نیست(?:م|ی|یم|ید|ند)?(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: PERSIAN_NEGATIVE_COPULA
  }),
  pl: foundationGrammar("pl-foundation", POLISH_NEGATIVE_EXISTENTIAL, {
  ruleId: "pl-negative-existential-nie-ma",
  name: "Absence or non-possession with nie ma + genitive",
  displayNames: { en: "Absence or non-possession with nie ma + genitive", ja: "nie ma ＋ 生格（不在・非所有）" },
  patternSource: String.raw`(?<!\p{L})[Nn]ie\s+ma(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: POLISH_NEGATIVE_EXISTENTIAL
  }),
  pt: foundationGrammar("pt-foundation", PORTUGUESE_EXISTENTIAL_HAVER, {
  ruleId: "pt-existential-ha",
  name: "Existence with impersonal há",
  displayNames: { en: "Existence with impersonal há", ja: "非人称 há の存在文" },
  patternSource: String.raw`(?<!\p{L})[Hh]á\s+(?:um|uma|dois|duas|três|muitos|muitas|alguns|algumas)\s+(?:pessoas?|problemas?|livros?|casas?|lugares?)(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: PORTUGUESE_EXISTENTIAL_HAVER
  }),
  ro: foundationGrammar("ro-foundation", ROMANIAN_NECESSITY, {
  ruleId: "ro-necessity-trebuie-sa",
  name: "Necessity with trebuie să",
  displayNames: { en: "Necessity with trebuie să", ja: "trebuie să による必要・義務" },
  patternSource: String.raw`(?<!\p{L})[Tt]rebuie\s+să\s+\p{Ll}{2,}(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: ROMANIAN_NECESSITY
  }),
  sh: foundationGrammar("sh-shtokavian-foundation", CROATIAN_EXISTENTIAL_NEMA, {
  ruleId: "sh-existential-nema-genitive",
  name: "Absence or non-possession with nema + genitive",
  displayNames: { en: "Absence or non-possession with nema + genitive", ja: "nema ＋ 生格（不在・非所有）" },
  patternSource: String.raw`(?<!\p{L})[Nn]ema\s+(?:kave|kruha|vode|problema|vremena|ljudi)(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: CROATIAN_EXISTENTIAL_NEMA
  }),
  sv: foundationGrammar("sv-foundation", SWEDISH_PRESENTATIVE_FINNS, {
  ruleId: "sv-presentative-det-finns",
  name: "Presentative det finns",
  displayNames: { en: "Presentative det finns", ja: "det finns の存在構文" },
  patternSource: String.raw`(?<!\p{L})[Dd]et\s+finns\s+(?:en|ett|många|inga|två|tre|\d+)\s+\p{L}+(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: SWEDISH_PRESENTATIVE_FINNS
  }),
  tl: foundationGrammar("tl-tagalog-foundation", TAGALOG_EXISTENTIALS, {
  ruleId: "tl-existential-may-mayroon",
  name: "Existence with may / mayroon",
  displayNames: { en: "Existence with may / mayroon", ja: "may / mayroon の存在文" },
  patternSource: String.raw`(?<!\p{L})(?:[Mm]ay|[Mm]ayroon(?:g)?)\s+(?:isang|mga|dalawang|tatlong|\p{L}{3,})(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: TAGALOG_EXISTENTIALS
  }),
  th: foundationGrammar("th-foundation", THAI_COPULAR_NEGATION, {
  ruleId: "th-copular-negation-mai-chai",
  name: "Copular negation with ไม่ใช่",
  displayNames: { en: "Copular negation with ไม่ใช่", ja: "ไม่ใช่ によるコピュラ否定" },
  patternSource: String.raw`ไม่ใช่`,
  priority: 20,
  confidence: "high",
  url: THAI_COPULAR_NEGATION
  }),
  tr: oneRuleGrammar(YEE_A1_A2, YEE_CEFR_BAND_LEVEL_SCALE, {
  ruleId: "tr-a1-a2-existence-var-yok",
  level: "A1–A2",
  name: "Existence or possession with var / yok",
  displayNames: { en: "Existence or possession with var / yok", ja: "var / yok の存在・所有文" },
  patternSource: String.raw`(?<!\p{L})(?:bir\s+)?\p{L}{2,}\s+(?:var|yok)(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: YEE_VAR_YOK
  }),
  vi: foundationGrammar("vi-foundation", VIETNAMESE_COMPLETION, {
  ruleId: "vi-completed-da-roi",
  name: "Completed action with đã … rồi",
  displayNames: { en: "Completed action with đã … rồi", ja: "đã … rồi の完了表現" },
  patternSource: String.raw`(?<!\p{L})[Đđ]ã\s+[^\n.!?]{1,50}?\s+rồi(?!\p{L})`,
  priority: 20,
  confidence: "high",
  url: VIETNAMESE_COMPLETION
  })
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
const GRAMMAR_BY_TARGET = Object.freeze({
  sq: FOUNDATION_GRAMMAR_BY_TARGET.sq,
  grc: FOUNDATION_GRAMMAR_BY_TARGET.grc,
  ar: FOUNDATION_GRAMMAR_BY_TARGET.ar,
  yue: FOUNDATION_GRAMMAR_BY_TARGET.yue,
  zh: FOUNDATION_GRAMMAR_BY_TARGET.zh,
  da: FOUNDATION_GRAMMAR_BY_TARGET.da,
  nl: FOUNDATION_GRAMMAR_BY_TARGET.nl,
  en: FOUNDATION_GRAMMAR_BY_TARGET.en,
  fi: FOUNDATION_GRAMMAR_BY_TARGET.fi,
  fr: FRENCH_GRAMMAR,
  de: GERMAN_GRAMMAR,
  el: FOUNDATION_GRAMMAR_BY_TARGET.el,
  hu: FOUNDATION_GRAMMAR_BY_TARGET.hu,
  id: FOUNDATION_GRAMMAR_BY_TARGET.id,
  it: FOUNDATION_GRAMMAR_BY_TARGET.it,
  km: FOUNDATION_GRAMMAR_BY_TARGET.km,
  ko: FOUNDATION_GRAMMAR_BY_TARGET.ko,
  lo: FOUNDATION_GRAMMAR_BY_TARGET.lo,
  la: FOUNDATION_GRAMMAR_BY_TARGET.la,
  mn: FOUNDATION_GRAMMAR_BY_TARGET.mn,
  fa: FOUNDATION_GRAMMAR_BY_TARGET.fa,
  pl: FOUNDATION_GRAMMAR_BY_TARGET.pl,
  pt: FOUNDATION_GRAMMAR_BY_TARGET.pt,
  ro: FOUNDATION_GRAMMAR_BY_TARGET.ro,
  ru: RUSSIAN_GRAMMAR,
  sh: FOUNDATION_GRAMMAR_BY_TARGET.sh,
  es: SPANISH_GRAMMAR,
  sv: FOUNDATION_GRAMMAR_BY_TARGET.sv,
  tl: FOUNDATION_GRAMMAR_BY_TARGET.tl,
  th: FOUNDATION_GRAMMAR_BY_TARGET.th,
  tr: FOUNDATION_GRAMMAR_BY_TARGET.tr,
  vi: FOUNDATION_GRAMMAR_BY_TARGET.vi
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
(() => {
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
    experiences: {
      // Published zh/yue character banks warrant a dedicated
      // per-character surface. Other scripts use the normal term
      // dictionary with a single grapheme as their query.
      characterLookup: usesHanScript ? "character-dictionary" : "term-dictionary"
    },
    featureSemantics: {
      characterSystem: language.defaultScript,
      phoneticScripts: readingAnnotation ? [language.id === "yue" ? "jyutping" : "pinyin"] : [],
      pronunciation: "ipa",
      readingAnnotation: readingAnnotation ? language.id === "yue" ? "jyutping" : "pinyin" : "dictionary reading"
    },
    grammar: grammarForRosterTarget(language.id),
    sentenceBoundaries: sentenceBoundariesForScripts(language.scripts),
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
let targetSelectionGeneration = 0;
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
function activeLearningTargetLanguage() {
  return activeLearningTarget().language;
}
function activeLearningTargetGeneration() {
  return targetSelectionGeneration;
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
function accentToRgba(color, alpha) {
  const safe = sanitizeAccentColor(color);
  const red = parseInt(safe.slice(1, 3), 16);
  const green = parseInt(safe.slice(3, 5), 16);
  const blue = parseInt(safe.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
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
function targetOcrLanguageTag(configured) {
  return configured?.trim() || activeLearningTarget().ocr.defaultLanguage;
}
function targetOcrLanguageHint(configured) {
  const configuredTag = configured?.trim();
  if (!configuredTag) return activeLearningTarget().ocr.languageHint;
  return languageSubtag(configuredTag) ?? configuredTag;
}
function isAbortError(error) {
  return (error instanceof Error || error instanceof DOMException) && error.name === "AbortError";
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
const EVENT_BRIDGE_TAG = Symbol.for("yomu.userscriptEventBridge");
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
const TARGET_AWARE_UI_COPY = Object.freeze({
  en: Object.freeze({
  puckStudyTarget: "Study {language}",
  puckLearningTarget: `${APP_NAME} — learning target: {language}`,
  puckAutoDetectTargetSubtitles: "Auto-detect {language} subtitles",
  puckFilterYoutubeTarget: "Filter YouTube for {language}",
  popupLanguageAxes: "Reading {target} · Definitions/translation: {output}",
  contextOccurrences: "In context ×{count}",
  loadTargetSubtitles: "Load {language} subtitles",
  loadOutputSubtitles: "Load {language} subtitles",
  readingAnnotations: "Reading annotations",
  hideReadingsFor: "Hide readings for"
  }),
  ja: Object.freeze({
  puckStudyTarget: "{language}を学習",
  puckLearningTarget: `${APP_NAME} — 学習対象：{language}`,
  puckAutoDetectTargetSubtitles: "{language}の字幕を自動検出",
  puckFilterYoutubeTarget: "YouTubeを{language}向けに絞る",
  popupLanguageAxes: "学習対象：{target}・定義/翻訳：{output}",
  contextOccurrences: "文脈内 ×{count}",
  loadTargetSubtitles: "{language}字幕を読み込む",
  loadOutputSubtitles: "{language}字幕を読み込む",
  readingAnnotations: "読みの注釈",
  hideReadingsFor: "読みを隠す対象"
  })
});
const COPY = {
  en: {
  settingsTitle: `${APP_NAME} Settings`,
  welcomeLabel: `${APP_NAME} welcome`,
  onboardingEyebrow: "{language}, wherever it appears",
  onboardingCopy: "Make {language} text, subtitles, and images tappable.",
  onboardingLanguage: "Settings language",
  onboardingOutputLanguage: "Definition and translation language (output)",
  onboardingTargetLanguage: "Language you are reading (target)",
  onboardingChooseTarget: "Choose a learning language…",
  onboardingTargetRequired: "Choose a learning language before continuing.",
  onboardingUnselectedTargetName: "your learning language",
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
  featureTextBody: "Hover or tap scanned {language}.",
  featureImages: "Images",
  featureImagesBody: "Read any image by tapping it.",
  featureVideo: "Video",
  featureVideoBody: "Make subtitle words tappable.",
  featureControl: "Control",
  featureControlBody: "Tune features, shortcuts, and color.",
  featureStudy: "Study",
  featureStudyBody: "Review words and characters on the study page.",
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
  ...TARGET_AWARE_UI_COPY.en,
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
  sourceHelpWanikaniKanji: "WaniKani kanji meaning/reading mnemonics, level, and SRS status.",
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
onboardingEyebrow	{language}がある場所ならどこでも
onboardingCopy	本文、字幕、画像の{language}をタップ可能にします。
onboardingLanguage	表示言語
onboardingOutputLanguage	定義・翻訳の言語（出力）
onboardingTargetLanguage	ページで読む言語（対象）
onboardingChooseTarget	学習する言語を選ぶ…
onboardingTargetRequired	続ける前に学習する言語を選んでください。
onboardingUnselectedTargetName	学習中の言語
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
featureTextBody	スキャンした{language}をホバー/タップできます。
featureImages	画像
featureImagesBody	画像をタップして読み取れます。
featureVideo	動画
featureVideoBody	字幕内の語もタップできます。
featureControl	調整
featureControlBody	機能、キー、色を調整できます。
featureStudy	学習
featureStudyBody	学習ページで単語と文字を復習。
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
pageScanModeManual	指示したときだけ{language}を検出
manualPageScanShortcut	手動ページスキャンのショートカット
manualScanEnabled	手動ページスキャン
ocrInteractionMode	画像OCRスキャン
ocrInteractionModeAuto	自動
ocrInteractionModeManual	タップ/ホバー
ocrInteractionModeOff	オフ
puckMenuLabel	よむ メニュー
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
clampedRowReadings	省略行の読み
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
sourceHelpWanikaniKanji	WaniKaniの漢字の意味・読みの覚え方、レベル、SRS状態です。
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
  ...SUBTITLE_SETTINGS_COPY.ja,
  ...TARGET_AWARE_UI_COPY.ja
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
Logger.scope("Settings");
function isPopupLookupEnabled(settings) {
  return settings.popupActivationMode !== "off" && (settings.lookupOnClick || settings.lookupOnHover || settings.lookupOnMiddleMouse);
}
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
  for (const state2 of FURIGANA_GROUP_STATES[group] ?? []) states.add(state2);
  }
  return states;
}
function shouldHideFuriganaForCardState(settings, state2) {
  const mode = effectiveFuriganaMode(settings);
  if (mode === "off") return true;
  return mode === "known-status" && furiganaHiddenStates(settings).has(state2);
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
  const { start, end } = token;
  return Number.isInteger(start) && Number.isInteger(end) && spanFitsText(start, end, offset, text) && tokenSourceSpanIsRenderable(token, text.slice(start, end));
}
function spanFitsText(start, end, offset, text) {
  return start >= Math.max(0, offset) && end > start && end <= text.length;
}
function tokenSourceSpanIsRenderable(token, source) {
  const target = learningTargetForToken(token);
  return target.language === "ja" ? HAS_JAPANESE_LETTER.test(source) : target.isLookupableText(source);
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
function shouldRenderRuby(surface, token, settings, allowRuby = true, preserveTokenRubies = false) {
  if (!allowRuby) return false;
  if (!effectiveTokenRubies(surface, token, preserveTokenRubies).length) return false;
  return furiganaModeAllowsRuby(effectiveFuriganaMode(settings), surface, token, settings);
}
function furiganaModeAllowsRuby(mode, surface, token, settings) {
  if (mode === "off") return false;
  if (mode === "known-status") return !shouldHideFuriganaForCardState(settings, primaryCardState(token.card.cardState));
  return mode !== "difficult-kanji" || targetAllowsFurigana(surface, token);
}
function targetAllowsFurigana(surface, token) {
  if (learningTargetForToken(token).typing.answerNormalizer !== "japanese-kana") return true;
  for (const char of surface) {
  if (isDifficultKanji(char)) return true;
  }
  return false;
}
function isDifficultKanji(char) {
  return KANJI_RE.test(char) && !EASY_FURIGANA_KANJI.has(char);
}
function readerWordClassName(state2, token, settings) {
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
  return renderTokenReadings(surface, token, kanjiNavigation, preserveTokenRubies);
}
function renderTokenReadings(surface, token, kanjiNavigation, preserveTokenRubies, layout) {
  let html = "";
  let localOffset = 0;
  for (const ruby of effectiveTokenRubies(surface, token, preserveTokenRubies)) {
  const start = ruby.start - token.start;
  const end = ruby.end - token.start;
  html += renderKanjiNavigationText(surface.slice(localOffset, start));
  const base = renderKanjiNavigationText(surface.slice(start, end));
  html += `<ruby><span class="jpdb-reader-ruby-base">${base}</span><rp>(</rp><rt class="jpdb-reader-furi">${escapeHtml(ruby.text)}</rt><rp>)</rp></ruby>`;
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
  return suffixes.sort((first, second) => second.length - first.length);
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
function sameKanaCharacter(first, second) {
  return Boolean(first && second && first === second && READING_KANA_ONLY_RE.test(first));
}
function effectiveTokenRubies(surface, token, preserveTokenRubies = false) {
  const target = learningTargetForToken(token);
  if (target.typography.readingAnnotationMode === "none") return [];
  const sources = sourceTokenRubies(surface, token);
  if (target.experiences.characterLookup === "term-dictionary") {
  return sources.filter((ruby) => localRubyRange(surface, token, ruby));
  }
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
  if (token.rubies.length) return explicitTokenRubies(surface, token);
  const reading = distinctTokenReading(surface, token);
  if (!reading) return [];
  if (surface.trim() === token.card.spelling.trim()) {
  return [{ text: reading, start: token.start, end: token.end, length: token.length }];
  }
  return inferredTokenRubies(surface, reading, token);
}
function explicitTokenRubies(surface, token) {
  return explicitRubyReadingMatchesSurface(surface, token) ? [] : token.rubies;
}
function distinctTokenReading(surface, token) {
  if (!surface) return null;
  const reading = trimmedTokenReading(token);
  if (!reading) return null;
  if (reading.normalize("NFC") === surface.normalize("NFC")) return null;
  return reading;
}
function trimmedTokenReading(token) {
  return token.card.reading?.trim() ?? "";
}
function inferredTokenRubies(surface, reading, token) {
  if (learningTargetForToken(token).typing.answerNormalizer !== "japanese-kana") return [];
  if (!KANJI_RE.test(surface)) return [];
  if (!READING_KANA_ONLY_RE.test(reading)) return [];
  const inferred = inferredInflectedSurfaceRubies(surface, token.card.spelling, reading);
  return inferred.map((ruby) => ({
  ...ruby,
  start: token.start + ruby.start,
  end: token.start + ruby.end
  }));
}
function explicitRubyReadingMatchesSurface(surface, token) {
  const ranges = token.rubies.flatMap((ruby) => {
  const range = localRubyRange(surface, token, ruby);
  return range ? [{ ...range, text: ruby.text }] : [];
  }).sort((first, second) => first.start - second.start);
  if (!ranges.length) return false;
  let cursor = 0;
  let reconstructed = "";
  for (const range of ranges) {
  if (range.start < cursor) return false;
  reconstructed += surface.slice(cursor, range.start) + range.text;
  cursor = range.end;
  }
  reconstructed += surface.slice(cursor);
  return reconstructed.normalize("NFC") === surface.normalize("NFC");
}
function learningTargetForToken(token) {
  return learningTargetModuleFor(token.card.language) ?? activeLearningTarget();
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
function isTargetLanguageText(text) {
  return activeLearningTarget().isLookupableText(text);
}
function segmentTargetLanguageText(text) {
  return activeLearningTarget().segment(text);
}
const YOUTUBE_APP_HOSTS = /* @__PURE__ */ new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "studio.youtube.com",
  "kids.youtube.com",
  "gaming.youtube.com",
  "youtu.be"
]);
function isYouTubeAppHostname(hostname = location.hostname) {
  return YOUTUBE_APP_HOSTS.has(hostname.toLowerCase());
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
new Set(
  "ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,BR,DD,DETAILS,DIALOG,DIV,DL,DT,FIGCAPTION,FIGURE,H1,H2,H3,H4,H5,H6,HR,LI,MAIN,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(",")
);
const TRAILING_DIGITS_RE = /[0-9０-９]+$/u;
const NUMBER_BIND_CLASS = "jpdb-reader-number-bind";
new Set("ADDRESS,ARTICLE,ASIDE,BLOCKQUOTE,DD,DETAILS,DIALOG,DIV,DL,DT,FIELDSET,FIGCAPTION,FIGURE,FOOTER,FORM,H1,H2,H3,H4,H5,H6,HEADER,HR,LI,MAIN,NAV,OL,P,PRE,SECTION,TABLE,TBODY,TD,TFOOT,TH,THEAD,TR,UL".split(","));
selectorPairs("control,toggle,player", ["class"]);
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
function renderTokenHtml(surface, token, settings, miningInsightKeys) {
  const state2 = primaryCardState(token.card.cardState);
  const hasRuby = shouldRenderRuby(surface, token, settings);
  const content = hasRuby ? renderRuby(surface, token) : escapeHtml(surface);
  const hasMiningInsight = miningInsightKeys.has(miningInsightTokenKey(token));
  const pitchClass = settings.showPitchAccent ? tokenPitchClass(token) : "";
  const classes = [
  readerWordClassName(state2, token, settings),
  hasRuby ? "jpdb-reader-has-furi" : "",
  hasMiningInsight ? "jpdb-reader-i-plus-one" : ""
  ].filter(Boolean).join(" ");
  const source = ` data-card-source="${escapeHtml(readerCardSource(token.card))}"`;
  const cardId = ` data-card-id="${readerCardId(token.card)}"`;
  const readingIndex = ` data-reading-index="${readerReadingIndex(token.card)}"`;
  const cardState = ` data-card-state="${escapeHtml(state2)}" data-state-provenance="${cardStateProvenance(token.card)}"`;
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
function claimOcrScan(owner) {
  const token = Symbol("ocr-scan");
  owner.scan = token;
  owner.loading = true;
  return token;
}
function releaseOcrScan(owner, token) {
  if (owner.scan !== token) return;
  owner.scan = void 0;
  owner.loading = false;
  owner.manualRequested = false;
}
function captureOcrTargetContext() {
  const target = activeLearningTarget();
  const generation = activeLearningTargetGeneration();
  const isCurrent = () => activeLearningTarget() === target && activeLearningTargetGeneration() === generation;
  return {
  generation,
  cacheKey: (contentKey) => `${contentKey}
@yomu-target:${target.language}`,
  workKey: (contentKey) => `${contentKey}
@yomu-target:${target.language}:${generation}`,
  isCurrent,
  requireCurrent(staleState) {
    if (!isCurrent()) throw staleState;
  }
  };
}
function ocrTargetWorkKey(contentKey) {
  return captureOcrTargetContext().workKey(contentKey);
}
function ocrTargetWork(contentKey, target = captureOcrTargetContext()) {
  return {
  target,
  contentKey,
  cacheKey: target.cacheKey(contentKey),
  workKey: target.workKey(contentKey)
  };
}
function ocrFallbackCardFromText(text) {
  const spelling = normalizeFallbackTerm(text);
  const language = activeLearningTargetLanguage();
  const id = -stablePositiveHashId(`ocr-fallback
${language}
${spelling}`);
  return {
  vid: id,
  sid: id,
  rid: 0,
  spelling,
  reading: "",
  language,
  frequencyRank: null,
  partOfSpeech: [],
  meanings: [],
  cardState: ["not-in-deck"],
  pitchAccent: [],
  wordWithReading: null,
  source: "fallback"
  };
}
function ocrRuntimeActive(settings) {
  return settings.ocrEnabled && !settings.annotationsPaused;
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
  markCanvasMirrorSkip(drawableCanvasContext(canvas)).drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function splitImageIntoPageColumns(image) {
  const size = loadedImageSize(image);
  const mid = Math.round(size.width / 2);
  return Promise.all([
  cropOcrImageColumn(image, 0, mid, size),
  cropOcrImageColumn(image, mid, size.width - mid, size)
  ]);
}
async function cropOcrImageColumn(image, left, width, size) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, size.height);
  markCanvasMirrorSkip(drawableCanvasContext(canvas)).drawImage(image, left, 0, width, size.height, 0, 0, canvas.width, canvas.height);
  return {
  image: await loadImage(canvas.toDataURL("image/jpeg", 0.9)),
  left,
  totalWidth: size.width,
  totalHeight: size.height
  };
}
function offsetOcrResult(result, left, top, width, height) {
  return {
  width,
  height,
  lines: result.lines.map((line) => ({
    ...line,
    box: { ...line.box, left: line.box.left + left, top: line.box.top + top }
  }))
  };
}
function mergeOcrResults(width, height, results) {
  const lines = results.flatMap((result) => result?.lines ?? []);
  return width && height && lines.length ? { width, height, lines } : null;
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
function loadImage(url, timeout = 0) {
  return new Promise((resolve, reject) => {
  const image = new Image();
  let timer = 0;
  const settle = (fn) => {
    if (timer) window.clearTimeout(timer);
    fn();
  };
  image.onload = () => settle(() => resolve(image));
  image.onerror = () => settle(() => reject(new Error("Image decode failed.")));
  if (timeout) timer = window.setTimeout(() => settle(() => reject(new Error("Image decode timed out."))), timeout);
  image.src = url;
  });
}
const OCR_BOX_INK_RATIO = 0.92;
const MIN_OCR_FONT_PX = 11;
function ocrFontPx(text, boxWidth, boxHeight, vertical, scale, measured) {
  const safeScale = Math.max(0.7, Math.min(1.8, scale));
  const boxThickness = vertical ? boxWidth : boxHeight;
  const boxLength = vertical ? boxHeight : boxWidth;
  const byBoxThickness = boxThickness / OCR_BOX_INK_RATIO;
  const byBoxLength = measuredFontPx(boxLength, measured) ?? estimatedFontPx(text, boxLength, vertical);
  return Math.max(MIN_OCR_FONT_PX, Math.min(byBoxThickness, byBoxLength) * safeScale);
}
function measuredFontPx(boxLength, measured) {
  if (!measured || !(measured.length > 0) || !(measured.fontSize > 0)) return null;
  return boxLength / measured.length * measured.fontSize;
}
function estimatedFontPx(text, boxLength, vertical) {
  return boxLength / Math.max(1, visualTextLength(text)) * (vertical ? 1.12 : 1.08);
}
function visualTextLength(text) {
  return [...text.trim()].reduce((total, char) => {
  if (/\s/.test(char)) return total + 0.35;
  if ((char.codePointAt(0) ?? 0) <= 255) return total + 0.62;
  return total + 1;
  }, 0);
}
function shouldCenterOcrText(text) {
  return visualTextLength(text) <= 1.5;
}
const OCR_WORD_UNDERLINE_OFFSET_EM = 0.12;
const OCR_WORD_UNDERLINE_THICKNESS_EM = 0.12;
const OCR_WORD_UNDERLINE_CLEARANCE_PX = 1;
function ocrWordUnderlineBleedPx(fontSize) {
  return Math.ceil(fontSize * (OCR_WORD_UNDERLINE_OFFSET_EM + OCR_WORD_UNDERLINE_THICKNESS_EM)) + OCR_WORD_UNDERLINE_CLEARANCE_PX;
}
function ocrLinePadding(fontSize, vertical, hasFurigana) {
  const underlineBleed = ocrWordUnderlineBleedPx(fontSize);
  return {
  padX: Math.max(4, Math.round(fontSize * 0.16)),
  padTop: hasFurigana ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(2, Math.round(fontSize * 0.08)),
  padBottom: vertical ? Math.max(3, Math.round(fontSize * 0.1)) : Math.max(3, underlineBleed)
  };
}
function ocrLineFrame(input) {
  const { box, frame, vertical, fontSize } = input;
  const padding = ocrLinePadding(fontSize, vertical, input.hasFurigana);
  const contentWidth = Math.max(1, input.contentWidth);
  const contentHeight = Math.max(1, input.contentHeight);
  const underlineBleed = ocrWordUnderlineBleedPx(fontSize);
  const minHitSize = Math.max(24, Math.round(fontSize * 1.25));
  const furiGutter = vertical && input.hasFurigana ? Math.round(fontSize * 0.55) : 0;
  const underlineGutter = vertical ? underlineBleed : 0;
  const width = Math.min(frame.imageWidth, Math.max(box.width, minHitSize, contentWidth + padding.padX * 2 + underlineGutter * 2));
  const height = Math.min(frame.imageHeight, Math.max(box.height, minHitSize, contentHeight + padding.padTop + padding.padBottom));
  const minLeft = frame.imageLeft;
  const minTop = frame.imageTop;
  const maxLeft = Math.max(minLeft, frame.imageLeft + frame.imageWidth - width - furiGutter);
  const maxTop = Math.max(minTop, frame.imageTop + frame.imageHeight - (frame.safeBottomInset ?? 0) - height);
  const left = clampNumber(box.left + box.width / 2 - width / 2, minLeft, maxLeft);
  const centeredTop = box.top + box.height / 2 - height / 2;
  const baselineAlignedTop = box.top + box.height - height + padding.padBottom;
  const targetTop = vertical ? box.top : shouldCenterOcrText(input.text) ? centeredTop : baselineAlignedTop;
  return {
  ...padding,
  left,
  top: clampNumber(targetTop, minTop, maxTop),
  width,
  height
  };
}
function layoutOcrLineElement(element, input) {
  const { box, frame, vertical } = input;
  if (!Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 0 || box.height <= 0) return null;
  const textElement = element.querySelector(".jpdb-ocr-line-text");
  if (!textElement) return null;
  const hasFurigana = Boolean(textElement.querySelector(".jpdb-reader-has-furi"));
  const typeface = input.typeface ?? ocrLayerTypeface(element);
  element.style.width = "";
  element.style.height = "";
  const fontSize = ocrFontPx(
  input.text,
  box.width,
  box.height,
  vertical,
  input.fontScale,
  measureOcrLineExtent(element, textElement, vertical, typeface, input.layerTransform)
  );
  element.style.fontSize = `${fontSize}px`;
  element.dataset.hasFuri = String(hasFurigana);
  const padding = ocrLinePadding(fontSize, vertical, hasFurigana);
  applyOcrLinePadding(element, padding);
  const content = paintedElementBox(textElement, input.layerTransform);
  const placed = ocrLineFrame({
  text: input.text,
  box,
  frame,
  vertical,
  hasFurigana,
  fontSize,
  contentWidth: content.width,
  contentHeight: content.height
  });
  element.style.left = `${placed.left}px`;
  element.style.top = `${placed.top}px`;
  element.style.width = `${placed.width}px`;
  element.style.height = `${placed.height}px`;
  return placed;
}
function layoutOcrOverlayLines(layer, frame, fontScale, layerTransform = null, knownTypeface) {
  const lines = layer.querySelectorAll(".jpdb-ocr-line");
  const typeface = knownTypeface ?? (lines.length > 0 ? ocrLayerTypeface(lines[0]) : "");
  lines.forEach((element) => {
  layoutOcrLineElement(element, {
    text: element.dataset.ocrText ?? "",
    box: {
      left: frame.imageLeft + Number(element.dataset.boxLeft) * frame.imageWidth,
      top: frame.imageTop + Number(element.dataset.boxTop) * frame.imageHeight,
      width: Number(element.dataset.boxWidth) * frame.imageWidth,
      height: Number(element.dataset.boxHeight) * frame.imageHeight
    },
    frame,
    vertical: element.dataset.vertical === "true",
    fontScale,
    typeface,
    layerTransform
  });
  });
}
function ocrLayerTypeface(line) {
  const view = line.ownerDocument.defaultView;
  return view ? view.getComputedStyle(line).fontFamily : "";
}
function ocrOverlayTypeface(layer) {
  const line = layer.querySelector(".jpdb-ocr-line");
  return line ? ocrLayerTypeface(line) : "";
}
const OCR_FIT_MEASURE_PX = 32;
const rememberedLineExtents = /* @__PURE__ */ new WeakMap();
function measureOcrLineExtent(line, textElement, vertical, typeface, layerTransform) {
  const signature = `${vertical ? "vertical" : "horizontal"}|${typeface}|${textElement.innerHTML}`;
  const remembered = rememberedLineExtents.get(line);
  if (remembered?.signature === signature) return remembered.measurement;
  line.style.width = "";
  line.style.height = "";
  line.style.fontSize = `${OCR_FIT_MEASURE_PX}px`;
  const length = axisLength(paintedElementBox(textElement, layerTransform), vertical);
  if (!(length > 0)) return void 0;
  const measurement = { fontSize: OCR_FIT_MEASURE_PX, length };
  rememberedLineExtents.set(line, { signature, measurement });
  return measurement;
}
function axisLength(box, vertical) {
  return vertical ? box.height : box.width;
}
function paintedElementBox(element, layerTransform) {
  const rect = element.getBoundingClientRect();
  if (!layerTransform) return { width: rect.width, height: rect.height };
  return untransformedBoxSize(rect, layerTransform, { width: element.offsetWidth, height: element.offsetHeight }) ?? { width: rect.width, height: rect.height };
}
function applyOcrLinePadding(element, padding) {
  element.style.setProperty("--jpdb-ocr-pad-x", `${padding.padX}px`);
  element.style.setProperty("--jpdb-ocr-pad-top", `${padding.padTop}px`);
  element.style.setProperty("--jpdb-ocr-pad-bottom", `${padding.padBottom}px`);
}
function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function paintedImageFrame(input) {
  const content = imageContentBox(input.image, input.rect, input.style);
  const object = fittedObjectSize(input.objectFit, input.sourceWidth, input.sourceHeight, content.width, content.height);
  const offset = objectPositionOffset(input.objectPosition, content.width - object.width, content.height - object.height);
  return {
  imageLeft: content.left + offset.x,
  imageTop: content.top + offset.y,
  imageWidth: Math.max(1, object.width),
  imageHeight: Math.max(1, object.height)
  };
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
const IDENTITY_TRANSFORM = { a: 1, b: 0, c: 0, d: 1 };
const TRANSFORM_EPSILON = 1e-6;
const MIN_INVERTIBLE_DETERMINANT = 0.05;
const rememberedAncestorTransforms = /* @__PURE__ */ new WeakMap();
let composedTransformGlobalEpoch = 0;
function forgetComposedOcrSurfaceTransform(element) {
  rememberedAncestorTransforms.delete(element);
}
function forgetAllComposedOcrSurfaceTransforms() {
  composedTransformGlobalEpoch += 1;
}
function composedOcrSurfaceTransform(element, mountParent, _rect, fresh = false) {
  const view = element.ownerDocument.defaultView;
  if (!view) return null;
  const ownTransform = view.getComputedStyle(element).transform;
  const stop = mountParent?.contains(element) ? mountParent : element.ownerDocument.body;
  const remembered = rememberedAncestorTransforms.get(element);
  if (!fresh && remembered?.[0] === composedTransformGlobalEpoch && remembered[1] === stop && remembered[2] === ownTransform) {
  return remembered[3];
  }
  let composed = parseCssTransformLinear(ownTransform);
  for (let node = element.parentElement; node && node !== stop && composed; node = node.parentElement) {
  composed = multiplyTransforms(parseCssTransformLinear(view.getComputedStyle(node).transform), composed);
  }
  const transform = composed && !isIdentityTransform(composed) ? composed : null;
  rememberedAncestorTransforms.set(element, [composedTransformGlobalEpoch, stop, ownTransform, transform]);
  return transform;
}
function ocrOverlayLayerPlacement(rect, linear, layout) {
  const axisAligned = {
  left: rect.left,
  top: rect.top,
  width: rect.width,
  height: rect.height,
  transform: "",
  linear: null
  };
  if (!linear || keepsReadableAxisAlignedPath(linear)) return axisAligned;
  const size = untransformedBoxSize(rect, linear, layout);
  if (!size) return axisAligned;
  const { a, b, c, d } = linear;
  const spanX = a * size.width;
  const spanY = c * size.height;
  return {
  // The rect's origin is the least corner of the transformed box, so the box's own
  // origin sits back along whichever corners the transform pushed out first.
  left: rect.left - Math.min(0, spanX, spanY, spanX + spanY),
  top: rect.top - Math.min(0, b * size.width, d * size.height, b * size.width + d * size.height),
  width: size.width,
  height: size.height,
  transform: `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`,
  linear
  };
}
function untransformedBoxSize(rect, linear, layout) {
  const a = Math.abs(linear.a);
  const b = Math.abs(linear.b);
  const c = Math.abs(linear.c);
  const d = Math.abs(linear.d);
  const determinant = a * d - c * b;
  if (Math.abs(determinant) >= MIN_INVERTIBLE_DETERMINANT) {
  const width = (d * rect.width - c * rect.height) / determinant;
  const height = (a * rect.height - b * rect.width) / determinant;
  if (width > 0 && height > 0) return { width, height };
  }
  return layout.width > 0 && layout.height > 0 ? layout : null;
}
function isIdentityTransform(linear) {
  return Math.abs(linear.a - 1) < TRANSFORM_EPSILON && Math.abs(linear.d - 1) < TRANSFORM_EPSILON && Math.abs(linear.b) < TRANSFORM_EPSILON && Math.abs(linear.c) < TRANSFORM_EPSILON;
}
function keepsReadableAxisAlignedPath(linear) {
  const axisAligned = Math.abs(linear.b) < TRANSFORM_EPSILON && Math.abs(linear.c) < TRANSFORM_EPSILON;
  if (axisAligned && linear.a > 0 && linear.d > 0) return true;
  const determinant = linear.a * linear.d - linear.b * linear.c;
  if (determinant < -TRANSFORM_EPSILON) return true;
  return axisAligned && linear.a < 0 && linear.d < 0;
}
function multiplyTransforms(outer, inner) {
  if (!outer) return null;
  return {
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d
  };
}
function parseCssTransformLinear(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "none") return IDENTITY_TRANSFORM;
  let composed = IDENTITY_TRANSFORM;
  for (const [name, args] of transformFunctions(trimmed)) {
  const step = transformFunctionLinear(name, args);
  if (!step) return null;
  composed = multiplyTransforms(composed, step) ?? IDENTITY_TRANSFORM;
  }
  return composed;
}
function transformFunctions(value) {
  const functions = [];
  const pattern = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
  for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
  functions.push([match[1].toLowerCase(), match[2].split(",").map((part) => part.trim())]);
  }
  return functions;
}
function transformFunctionLinear(name, args) {
  const numbers = args.map((arg) => Number.parseFloat(String(arg)));
  switch (name) {
  case "matrix":
    return numbers.length >= 4 && numbers.slice(0, 4).every(Number.isFinite) ? { a: numbers[0], b: numbers[1], c: numbers[2], d: numbers[3] } : null;
  case "matrix3d":
    return flatMatrix3dLinear(numbers);
  case "translate":
  case "translatex":
  case "translatey":
  case "translatez":
  case "translate3d":
  case "none":
    return IDENTITY_TRANSFORM;
  case "scale":
  case "scale3d": {
    const scaleX = Number.isFinite(numbers[0]) ? numbers[0] : 1;
    const scaleY = Number.isFinite(numbers[1]) ? numbers[1] : scaleX;
    return { a: scaleX, b: 0, c: 0, d: scaleY };
  }
  case "scalex":
    return Number.isFinite(numbers[0]) ? { a: numbers[0], b: 0, c: 0, d: 1 } : null;
  case "scaley":
    return Number.isFinite(numbers[0]) ? { a: 1, b: 0, c: 0, d: numbers[0] } : null;
  case "rotate":
  case "rotatez": {
    const radians = cssAngleRadians(String(args[0] ?? ""));
    return radians === null ? null : {
      a: Math.cos(radians),
      b: Math.sin(radians),
      c: -Math.sin(radians),
      d: Math.cos(radians)
    };
  }
  case "skew":
  case "skewx":
  case "skewy": {
    const first = cssAngleRadians(String(args[0] ?? "0deg"));
    const second = args.length > 1 ? cssAngleRadians(String(args[1])) : 0;
    if (first === null || second === null) return null;
    if (name === "skewy") return { a: 1, b: Math.tan(first), c: 0, d: 1 };
    return { a: 1, b: Math.tan(second ?? 0), c: Math.tan(first), d: 1 };
  }
  default:
    return null;
  }
}
function flatMatrix3dLinear(numbers) {
  if (numbers.length < 16 || !numbers.every(Number.isFinite)) return null;
  const flat = [2, 3, 6, 7, 8, 9, 11, 14].every((index) => Math.abs(numbers[index]) < TRANSFORM_EPSILON) && Math.abs(numbers[10] - 1) < TRANSFORM_EPSILON && Math.abs(numbers[15] - 1) < TRANSFORM_EPSILON;
  return flat ? { a: numbers[0], b: numbers[1], c: numbers[4], d: numbers[5] } : null;
}
function cssAngleRadians(value) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return null;
  if (value.endsWith("rad")) return amount;
  if (value.endsWith("turn")) return amount * 2 * Math.PI;
  if (value.endsWith("grad")) return amount * Math.PI / 200;
  return amount * Math.PI / 180;
}
const positionedLayoutKeys = /* @__PURE__ */ new WeakMap();
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
function setOcrLayerTransform(overlay, transform) {
  if (overlay.style.transform === transform) return;
  overlay.style.transform = transform;
  overlay.style.transformOrigin = transform ? "0 0" : "";
}
function layoutOcrOverlayIfChanged(overlay, frame, fontScale, transform, typeface, force = false) {
  const key = JSON.stringify([frame, fontScale, transform, typeface]);
  if (!force && positionedLayoutKeys.get(overlay) === key) return;
  layoutOcrOverlayLines(overlay, frame, fontScale, transform, typeface);
  positionedLayoutKeys.set(overlay, key);
}
function ocrPlacedSurfaceRect(rect, placement) {
  if (placement.width === rect.width && placement.height === rect.height) return rect;
  return {
  left: placement.left,
  top: placement.top,
  bottom: placement.top + placement.height,
  width: placement.width,
  height: placement.height
  };
}
function setOcrArtifactPosition(element, viewportLeft, viewportTop, offset = ocrArtifactRootOffset(element)) {
  element.style.left = `${viewportLeft - offset.left}px`;
  element.style.top = `${viewportTop - offset.top}px`;
}
function ocrArtifactRootOffset(element) {
  if (element.dataset.yomuOcrFullscreenHosted !== "true") return { left: 0, top: 0 };
  const root = element.parentElement;
  if (!root || root === document.body || root === document.documentElement) return { left: 0, top: 0 };
  const rect = root.getBoundingClientRect();
  return { left: rect.left, top: rect.top };
}
function readBlobAsDataUrl(blob, errorMessage = "Could not read media.") {
  return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(reader.error ?? new Error(errorMessage));
  reader.readAsDataURL(blob);
  });
}
function pushTargetLanguageOcrLine(lines, text, box) {
  if (!text || !box || !isTargetLanguageText(text)) return;
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
const JAPANESE_INTERNAL_SPACE = /(?<=[、-〿぀-ヿ㐀-鿿！-｠])[ \t]+(?=[、-〿぀-ヿ㐀-鿿！-｠])/g;
function cleanOcrText(value) {
  const text = typeof value === "string" ? value : String(value ?? "");
  const collapsed = text.replace(/[ \t\r\n]+/g, " ").trim();
  const normalized = HAS_JAPANESE.test(collapsed) ? collapsed.replace(JAPANESE_INTERNAL_SPACE, "") : collapsed;
  return normalized.replaceAll("．．．", "…");
}
function numberFrom(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function normalizeCloudVisionResponse(record2, fallbackWidth, fallbackHeight) {
  const state2 = { width: fallbackWidth, height: fallbackHeight, lines: [] };
  for (const response of cloudVisionResponses(record2)) {
  appendCloudVisionPages(response, state2);
  appendCloudVisionTextAnnotations(response, state2);
  }
  return state2.lines.length ? { width: state2.width, height: state2.height, lines: state2.lines } : null;
}
function cloudVisionResponses(record2) {
  if (Array.isArray(record2.responses)) return record2.responses;
  return "fullTextAnnotation" in record2 ? [record2] : [];
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
  pushTargetLanguageOcrLine(state2.lines, text, box);
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
  pushTargetLanguageOcrLine(lines, cleanOcrText(current.text), unionBoxes(current.boxes));
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
  const record2 = {};
  index += 1;
  skipWhitespace();
  while (source[index] !== "}") {
    const key = parseObjectKey();
    skipWhitespace();
    expect(":");
    record2[key] = parseValue();
    skipWhitespace();
    if (source[index] === ",") {
      index += 1;
      skipWhitespace();
      continue;
    }
    break;
  }
  expect("}");
  return record2;
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
function normalizeOcrResult(value, fallbackWidth = 1, fallbackHeight = 1) {
  if (!value || typeof value !== "object") return null;
  const record2 = value;
  const cloudVision = normalizeCloudVisionResponse(record2, fallbackWidth, fallbackHeight);
  if (cloudVision) return cloudVision;
  const { width, height } = ocrResultDimensions(record2, fallbackWidth, fallbackHeight);
  const lines = collectGenericOcrLines(record2, width, height);
  return japaneseOcrResult(width, height, lines);
}
function ocrResultDimensions(record2, fallbackWidth, fallbackHeight) {
  const resolution = record2.context_resolution;
  const width = numberFrom(record2.width) || numberFrom(resolution?.width) || fallbackWidth;
  const height = numberFrom(record2.height) || numberFrom(resolution?.height) || fallbackHeight;
  return { width, height };
}
function collectGenericOcrLines(record2, width, height) {
  const lines = [];
  appendGenericOcrLines(lines, genericRawLines(record2), width, height, normalizeSimpleLines);
  appendGenericOcrLines(lines, record2.results, width, height, normalizeStructuredOcrResults);
  appendGenericOcrLines(lines, record2.ocr_regions, width, height, normalizeOcrRegionResults);
  return lines;
}
function genericRawLines(record2) {
  return Array.isArray(record2.lines) ? record2.lines : record2.regions;
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
  const japaneseLines = removeStandaloneFuriganaLines(lines).filter((line) => line.text.length > 0 && isTargetLanguageText(line.text));
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
  if (!KANJI_LIKE_RE.test(cleaned.slice(ruby.start, ruby.end))) continue;
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
  if (!text || text.length > 10 || !READING_KANA_ONLY_RE.test(text)) return false;
  return lines.some((other, otherIndex) => otherIndex !== index && KANJI_LIKE_RE.test(other.text) && ocrLineLooksLikeFuriganaFor(line, other));
}
function ocrLineLooksLikeFuriganaFor(furi, base) {
  if (furi.vertical || base.vertical) return ocrLineLooksLikeVerticalFuriganaFor(furi, base);
  const overlap = horizontalOverlap(furi.box, base.box);
  const overlapRatio = overlap / Math.max(1, Math.min(furi.box.width, base.box.width));
  const smaller = furi.box.height <= base.box.height * 0.75;
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
  const smaller = furi.box.width <= base.box.width * 0.75;
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
  if (!text || !isTargetLanguageText(text)) return null;
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
    pushTargetLanguageOcrLine(lines, text, box);
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
  const record2 = asRecord(value);
  if (!record2) return null;
  const text = simpleLineText(record2);
  const box = simpleLineBox(record2, width, height);
  if (!text || !box) return null;
  return { text, box, vertical: simpleLineIsVertical(record2) };
}
function simpleLineText(record2) {
  return stringFrom(record2.text) || stringFrom(record2.content) || stringFrom(record2.sentence);
}
function simpleLineBox(record2, width, height) {
  return normalizeBox(record2.box ?? record2.boundingBox ?? record2, width, height);
}
function simpleLineIsVertical(record2) {
  return Boolean(record2.vertical ?? record2.is_vertical);
}
function normalizeStructuredOcrResult(value, width, height) {
  if (!value || typeof value !== "object") return [];
  const record2 = value;
  const textLines = structuredOcrTextLines(record2);
  const vertical = structuredOcrVertical(record2);
  const lines = textLines.map((item) => normalizeStructuredOcrLine(item, width, height, vertical)).filter((line) => line !== null);
  if (lines.length) return lines;
  return normalizeStructuredOcrFallback(record2, textLines, width, height, vertical);
}
function structuredOcrTextLines(record2) {
  if (Array.isArray(record2.text_lines)) return record2.text_lines;
  return Array.isArray(record2.text) ? record2.text : [];
}
function structuredOcrVertical(record2) {
  return Boolean(record2.is_vertical ?? record2.box?.isVertical);
}
function normalizeStructuredOcrLine(item, width, height, inheritedVertical) {
  const lineRecord = asRecord(item);
  if (!lineRecord) return null;
  const text = structuredOcrLineText(lineRecord);
  const box = structuredOcrLineBox(lineRecord, width, height);
  if (!text || !box) return null;
  return { text, box, vertical: structuredOcrLineVertical(lineRecord, inheritedVertical) };
}
function structuredOcrLineText(record2) {
  return stringFrom(record2.content ?? record2.text ?? record2.word);
}
function structuredOcrLineBox(record2, width, height) {
  return normalizeBox(record2.box ?? record2.boundingBox ?? record2, width, height);
}
function structuredOcrLineVertical(record2, inheritedVertical) {
  return Boolean(record2.is_vertical ?? record2.box?.isVertical ?? inheritedVertical);
}
function normalizeStructuredOcrFallback(record2, textLines, width, height, vertical) {
  const text = cleanOcrText(textLines.map((item) => stringFrom(item?.content)).filter(Boolean).join(" "));
  const box = normalizeBox(record2.box, width, height);
  return text && box ? [{ text, box, vertical }] : [];
}
function normalizeOcrRegion(record2, width, height) {
  const region = readOcrRegion(record2);
  if (!region) return null;
  const box = clampBox(scaleOcrRegion(region, width, height), width, height);
  return box && !isFullImageOcrRegion(box, width, height) ? box : null;
}
function readOcrRegion(record2) {
  const position = record2.position;
  const size = record2.size;
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
  const record2 = value;
  return normalizePositionDimensionsBox(record2, width, height) ?? normalizeDirectBox(record2, width, height) ?? normalizePointBox(record2, width, height);
}
function normalizePositionDimensionsBox(record2, width, height) {
  const position = asRecord(record2.position);
  const dimensions = asRecord(record2.dimensions);
  if (!position || !dimensions) return null;
  return boxFromNumbers({
  left: numberFrom(position.left),
  top: numberFrom(position.top),
  width: numberFrom(dimensions.width),
  height: numberFrom(dimensions.height)
  }, width, height, "percent-100");
}
function normalizeDirectBox(record2, width, height) {
  const box = directBoxNumbers(record2);
  return boxFromNumbers(box, width, height, directBoxScale(box));
}
function directBoxNumbers(record2) {
  return {
  left: numberFrom(record2.left ?? record2.x),
  top: numberFrom(record2.top ?? record2.y),
  width: numberFrom(record2.width ?? record2.w),
  height: numberFrom(record2.height ?? record2.h)
  };
}
function directBoxScale(box) {
  return Object.values(box).every((value) => value !== null && value <= 1) ? "fraction" : "pixels";
}
function normalizePointBox(record2, width, height) {
  const points = ["top_left", "top_right", "bottom_right", "bottom_left"].map((key) => asRecord(record2[key])).filter((point) => Boolean(point));
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
  return typeof value === "string" ? cleanOcrText(value) : "";
}
function asRecord(value) {
  return value && typeof value === "object" ? value : null;
}
const LENS_PLATFORM_WEB = 3;
const LENS_SURFACE_CHROMIUM = 4;
const LENS_AUTO_FILTER = 7;
function googleLensAcceptLanguage(configured) {
  return `${targetOcrLanguageHint(configured)},en-US;q=0.9,en;q=0.8`;
}
function createGoogleLensRequest(imageBytes, width, height, locale) {
  const [language = "", region = "US"] = (locale || targetOcrLanguageTag()).split(/[-_]/);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const requestId = protoMessage(
  protoVarintField(1, BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1e6))),
  protoVarintField(2, 1),
  protoVarintField(3, 1),
  protoBytesField(4, randomBytes(16))
  );
  const localeContext = protoMessage(
  protoStringField(1, language || targetOcrLanguageHint()),
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
const OCR_MIN_ATTEMPT_TIMEOUT_MS = 3e4;
const DEFAULT_LOCAL_OCR_ENDPOINT_URL = "http://127.0.0.1:7331/ocr";
function ocrAttemptTimeoutMs(settings, floorMs = OCR_MIN_ATTEMPT_TIMEOUT_MS) {
  return Math.max(floorMs, settings.audioTimeoutMs);
}
function imageCacheKey(image) {
  const contentKey = image.dataset?.ocrContentKey;
  if (contentKey) return contentKey;
  return `${image.currentSrc || image.src}|${image.naturalWidth}x${image.naturalHeight}`;
}
function localOcrEndpointUrl(settings) {
  return settings.ocrEndpointUrl.trim() || DEFAULT_LOCAL_OCR_ENDPOINT_URL;
}
function isOcrRequestTimeout(error) {
  return error instanceof Error && /timed out|timeout/i.test(error.message);
}
const log$1 = Logger.scope("OCR");
const GOOGLE_LENS_ENDPOINT = "https://lensfrontend-pa.googleapis.com/v1/crupload";
const GOOGLE_LENS_API_KEY = "AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY";
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
async function recognizeViaLocalService(image, settings, invert = false) {
  const payload = await imageToBase64Payload(image, settings.ocrMaxImagePixels, invert);
  const engine = settings.ocrEngine === "auto" ? "" : settings.ocrEngine;
  const body = JSON.stringify({
  id: imageCacheKey(image),
  language_code: targetOcrLanguageTag(settings.ocrLanguage),
  language: {
    bcp47_tag: targetOcrLanguageTag(settings.ocrLanguage),
    two_letter_code: targetOcrLanguageHint(settings.ocrLanguage)
  },
  base64_image: payload.base64,
  image: payload.base64,
  image_bytes: payload.base64,
  ocr_engine: engine,
  ocr_adapter_name: engine,
  detection_only: false
  });
  const response = await requestJson(localOcrEndpointUrl(settings), body, ocrAttemptTimeoutMs(settings));
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
    imageContext: { languageHints: [targetOcrLanguageHint(settings.ocrLanguage)] }
  }]
  });
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`;
  const response = await requestJson(url, body, ocrAttemptTimeoutMs(settings));
  return normalizeOcrResult(response, payload.width, payload.height);
}
async function recognizeViaGoogleLens(image, settings, invert = false) {
  const { canvas, blob } = await imageToBlobPayload(image, settings.ocrMaxImagePixels, "image/jpeg", 0.88, invert);
  const deadline = Date.now() + ocrAttemptTimeoutMs(settings);
  let protobufFailure;
  const protobuf = await recognizeViaGoogleLensProtobuf(
  blob,
  canvas,
  settings,
  Math.max(1, remainingGoogleLensTimeout(deadline))
  ).catch((error) => {
  protobufFailure = error;
  log$1.warn("Google Lens protobuf failed", error);
  return void 0;
  });
  if (protobuf?.lines.length) return protobuf;
  const uploadTimeout = remainingGoogleLensTimeout(deadline);
  if (uploadTimeout <= 0) {
  if (protobuf === void 0) throw new Error("Google Lens OCR timed out.");
  return protobuf;
  }
  let uploadFailure;
  const upload = await recognizeViaGoogleLensUpload(blob, canvas.width, canvas.height, uploadTimeout).catch((error) => {
  uploadFailure = error;
  log$1.warn("Google Lens upload failed", error);
  return void 0;
  });
  if (upload === void 0 && isOcrRequestTimeout(uploadFailure)) {
  throw new Error("Google Lens OCR timed out.");
  }
  if (protobuf === void 0 && upload === void 0) {
  if (isOcrRequestTimeout(protobufFailure) || isOcrRequestTimeout(uploadFailure)) {
    throw new Error("Google Lens OCR timed out.");
  }
  throw new Error("Google Lens OCR failed.");
  }
  return upload?.lines.length ? upload : upload ?? protobuf ?? null;
}
function remainingGoogleLensTimeout(deadline) {
  return Math.max(0, deadline - Date.now());
}
async function recognizeViaGoogleLensProtobuf(blob, canvas, settings, timeout) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const body = createGoogleLensRequest(bytes, canvas.width, canvas.height, settings.ocrLanguage);
  const response = await requestArrayBuffer(GOOGLE_LENS_ENDPOINT, body, timeout, googleLensAcceptLanguage(settings.ocrLanguage));
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
function requestArrayBuffer(url, data, timeout, acceptLanguage) {
  const body = new Uint8Array(data);
  const headers = {
  "content-type": "application/x-protobuf",
  "x-goog-api-key": GOOGLE_LENS_API_KEY,
  accept: "*/*",
  "accept-language": acceptLanguage
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
  return fetchWithTimeout(url, {
  method: "POST",
  headers,
  body: body.buffer
  }, timeout, "Google Lens timed out.").then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`Google Lens returned ${response.status}.`)));
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
  return fetchWithTimeout(url, { method: "POST", body: data }, timeout, "Google Lens upload timed out.").then((response) => response.ok ? response.text() : Promise.reject(new Error(`Google Lens upload returned ${response.status}.`)));
}
function fetchWithTimeout(url, init, timeout, timeoutMessage) {
  if (!timeout) return fetch(url, init);
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
  timedOut = true;
  controller.abort();
  }, timeout);
  return fetch(url, { ...init, signal: controller.signal }).catch((error) => {
  if (timedOut || isAbortError(error)) throw new Error(timeoutMessage);
  throw error;
  }).finally(() => window.clearTimeout(timeoutId));
}
function requestBlob(url, timeout = 0) {
  const fallbackType = imageMimeTypeFromUrl(url);
  const userscriptRequest = requestViaUserscript({
  method: "GET",
  url,
  responseType: "arraybuffer",
  timeout
  }, (response) => blobFromUserscriptResponse(response, fallbackType), (status) => `Image fetch returned ${status}.`, timeout ? "Image fetch timed out." : void 0);
  if (userscriptRequest) return userscriptRequest;
  if (!timeout) return fetch(url).then((response) => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`)));
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  return fetch(url, { signal: controller.signal }).then((response) => response.ok ? response.blob() : Promise.reject(new Error(`Image fetch returned ${response.status}.`))).finally(() => window.clearTimeout(timer));
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
  if (!userscriptRequest) {
  log$1.warnOnce("no-userscript-http-request", "No userscript HTTP request (GM_xmlhttpRequest / GM.xmlHttpRequest) available — cross-origin OCR/image fetch is blocked. Grant GM.xmlHttpRequest in the userscript manager.");
  return null;
  }
  return requestViaUserscriptManager(userscriptRequest, {
  details: options,
  readResponse: (response) => {
    if (!isSuccessfulHttpStatus(response.status)) throw new Error(statusMessage(response.status));
    return readResponse(response);
  },
  onError: (error) => error instanceof Error ? error : new Error(String(error || "Request failed.")),
  onTimeout: () => new Error(timeoutMessage ?? "Request timed out.")
  });
}
function isSuccessfulHttpStatus(status) {
  return status >= 200 && status < 300;
}
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
  canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Image encoding failed.")), type, quality);
  });
}
function normalizeOcrRenderedText(root, isolatePageScanners = false) {
  root.classList.toggle("jpdb-ocr-page-scanner-isolated", isolatePageScanners);
  if (!isolatePageScanners) restoreOcrVisualText(root);
  normalizeOcrRuby(root);
  normalizeOcrPlainText(root);
  if (isolatePageScanners) isolateOcrVisualText(root);
}
function restoreOcrVisualText(root) {
  root.querySelectorAll(".jpdb-ocr-visual-text[data-yomu-ocr-visual-text]").forEach((element) => {
  element.replaceWith(document.createTextNode(element.dataset.yomuOcrVisualText ?? ""));
  });
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
function isolateOcrVisualText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
  if (node instanceof Text && node.data) textNodes.push(node);
  }
  for (const textNode of textNodes) {
  const replacement = document.createElement("span");
  replacement.className = "jpdb-ocr-visual-text";
  replacement.dataset.yomuOcrVisualText = textNode.data;
  replacement.setAttribute("aria-hidden", "true");
  textNode.replaceWith(replacement);
  }
}
const STORE_KEY = "yomu-ocr-cache-v2";
const LEGACY_STORE_KEYS = ["yomu-ocr-cache-v1"];
const MAX_ENTRIES = 300;
const MAX_BYTES = 15e5;
const PERSIST_DELAY_MS = 1200;
function storage() {
  try {
  return typeof localStorage !== "undefined" ? managedLocalStorage : null;
  } catch {
  return null;
  }
}
function isPersistableOcrCacheKey(key) {
  return !key.startsWith("data:") && !key.startsWith("blob:");
}
function isPersistableOcrCacheEntry(key, result) {
  if (!isPersistableOcrCacheKey(key)) return false;
  if (result === null && (key.startsWith("cv:") || key.startsWith("src:"))) return false;
  return true;
}
function loadPersistedOcrCache() {
  const map = /* @__PURE__ */ new Map();
  const store = storage();
  if (!store) return map;
  try {
  for (const key of LEGACY_STORE_KEYS) store.removeItem(key);
  const raw = store.getItem(STORE_KEY);
  if (!raw) return map;
  const parsed = JSON.parse(raw);
  for (const [key, entry] of Object.entries(parsed).sort((a, b) => (a[1]?.at ?? 0) - (b[1]?.at ?? 0))) {
    const result = entry?.r ?? null;
    if (!isPersistableOcrCacheEntry(key, result)) continue;
    map.set(key, result);
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
    if (!isPersistableOcrCacheEntry(key, result)) continue;
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
const BW_VERTICAL_SURFACE_SELECTOR = '.canvasRoot.verticalAxis[id], [id^="wideScreen"][id]';
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
const canvasTaintVerdict = /* @__PURE__ */ new WeakMap();
const CANVAS_TAINT_VERDICT_TTL_MS = 1e4;
function canvasKnownTainted(canvas) {
  const hit = canvasTaintVerdict.get(canvas);
  if (!hit || !hit.tainted) return false;
  if (hit.key !== `${canvas.width}x${canvas.height}`) return false;
  return Date.now() - hit.at < CANVAS_TAINT_VERDICT_TTL_MS;
}
function rememberCanvasTaint(canvas, tainted) {
  canvasTaintVerdict.set(canvas, { key: `${canvas.width}x${canvas.height}`, tainted, at: Date.now() });
}
function sampleCanvasContent(canvas) {
  if (canvasKnownTainted(canvas)) return null;
  try {
  const sample = document.createElement("canvas");
  sample.width = CONTENT_SAMPLE_SIZE;
  sample.height = CONTENT_SAMPLE_SIZE;
  const context = markCanvasMirrorSkip(sample.getContext("2d", { willReadFrequently: true }));
  if (!context) return null;
  context.drawImage(
    canvas,
    0,
    0,
    canvas.width,
    canvas.height,
    0,
    0,
    CONTENT_SAMPLE_SIZE,
    CONTENT_SAMPLE_SIZE
  );
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
  rememberCanvasTaint(canvas, false);
  return { buckets: buckets.size, contrast: max - min, hash, opaque };
  } catch (error) {
  if (isCanvasTaintError(error)) rememberCanvasTaint(canvas, true);
  return null;
  }
}
function isCanvasTaintError(error) {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
  return error.name === "SecurityError";
  }
  return error instanceof Error && /insecure|tainted|cross-origin/i.test(error.message);
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
  if (shouldForceCanvasReaderSurface(canvas)) return hasForcedCanvasReaderShape(canvas);
  if (!hasPageShape(canvas)) return false;
  if (lenient) return true;
  return isViewportProminent(canvas) && looksLikeRenderedCanvasImage(canvas);
}
function pageCanvases(hostname = location.hostname, options = {}) {
  const lenient = isKnownCanvasReaderHost(hostname) || Boolean(document.querySelector(PAGE_COUNTER_SELECTOR));
  const canvases = Array.from(document.querySelectorAll("canvas")).filter((canvas) => !shouldSkipCanvasReaderSurface(canvas)).filter(isVisibleCanvasReaderSurface).filter((canvas) => isLikelyPageCanvas(canvas, lenient));
  if (!isBookwalkerViewerHost(hostname) || options.preferBookwalkerCurrent === false) return canvases;
  const continuousScroll = bookwalkerContinuousScrollCanvases(canvases, hostname);
  return continuousScroll.length ? continuousScroll : preferCurrentScreenCanvases(canvases);
}
function shouldSkipCanvasReaderSurface(canvas) {
  const mode = canvasOcrMode(canvas);
  return mode === "off" || mode === "manual";
}
function isVisibleCanvasReaderSurface(canvas) {
  if (canvas.hidden || canvas.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(canvas);
  if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
  if (Number(style.opacity || "1") <= 0) return false;
  return true;
}
function shouldForceCanvasReaderSurface(canvas) {
  return canvasOcrMode(canvas) === "on";
}
function isManualCanvasReaderSurface(canvas) {
  return canvasOcrMode(canvas) === "manual" && isVisibleCanvasReaderSurface(canvas) && isLikelyPageCanvas(canvas, true);
}
function canvasOcrMode(canvas) {
  return canvas.dataset.yomuCanvasOcr || canvas.closest("[data-yomu-canvas-ocr]")?.dataset.yomuCanvasOcr;
}
function hasForcedCanvasReaderShape(canvas) {
  const { width, height } = canvas;
  if (Math.max(width, height) < MIN_PAGE_CANVAS_DIMENSION || Math.min(width, height) < MIN_RENDERED_DIMENSION) return false;
  const aspect = width / height;
  return aspect >= MIN_PAGE_CANVAS_ASPECT && aspect <= MAX_PAGE_CANVAS_ASPECT;
}
function bookwalkerContinuousScrollCanvases(canvases, hostname = location.hostname) {
  if (!isBookwalkerViewerHost(hostname)) return [];
  const byViewport = /* @__PURE__ */ new Map();
  for (const canvas of canvases) {
  const viewport = canvas.closest(VIEWPORT_CONTAINER_SELECTOR);
  if (!viewport) continue;
  const group = byViewport.get(viewport) ?? [];
  group.push(canvas);
  byViewport.set(viewport, group);
  }
  const scrollCanvases = [];
  for (const [viewport, group] of byViewport) {
  const explicitContinuousViewport = viewport.id === "viewportW" || viewport.classList.contains("overScroll");
  if (explicitContinuousViewport || hasVerticallyStackedDocumentPageRun(group)) scrollCanvases.push(...group);
  }
  if (scrollCanvases.length < 2) return [];
  return hasVerticallyStackedDocumentPageRun(scrollCanvases) ? scrollCanvases : [];
}
function isBookwalkerContinuousScrollCanvas(canvas) {
  if (!isBookwalkerViewerHost()) return false;
  return bookwalkerContinuousScrollCanvases(pageCanvases(location.hostname, { preferBookwalkerCurrent: false })).includes(canvas);
}
function preferCurrentScreenCanvases(canvases) {
  if (canvases.length < 2) return canvases;
  const visible = visibleViewportCanvases(canvases);
  if (hasDistinctVisiblePageLayout(visible)) return visible;
  const current = canvases.filter(isOnScreenViewportCanvas);
  if (current.length && visible.length === 1 && !current.includes(visible[0])) return visible;
  if (hasVerticallyStackedDocumentPageRun(canvases)) return canvases;
  if (!current.length) return canvases;
  const renderedCurrent = current.filter(looksLikeRenderedCanvasImage);
  if (renderedCurrent.length) return renderedCurrent;
  const renderedFallback = canvases.filter((canvas) => !current.includes(canvas)).filter(looksLikeRenderedCanvasImage);
  return renderedFallback.length ? renderedFallback : current;
}
function visibleViewportCanvases(canvases) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!viewportWidth || !viewportHeight) return [];
  return canvases.filter((canvas) => {
  const rect = canvas.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
  });
}
function hasDistinctVisiblePageLayout(canvases) {
  return hasDistinctPageLayout(canvases.map((canvas) => canvas.getBoundingClientRect()));
}
function hasVerticallyStackedDocumentPageRun(canvases) {
  const rects = canvases.map((canvas) => canvas.getBoundingClientRect()).filter((rect) => rect.width > 0 && rect.height > 0).sort((a, b) => a.top - b.top);
  if (rects.length < 2) return false;
  for (let index = 1; index < rects.length; index += 1) {
  const previous = rects[index - 1];
  const current = rects[index];
  const smallerHeight = Math.max(1, Math.min(previous.height, current.height));
  const smallerWidth = Math.max(1, Math.min(previous.width, current.width));
  const verticalOverlap2 = Math.max(0, Math.min(previous.bottom, current.bottom) - Math.max(previous.top, current.top));
  const horizontalOverlap2 = Math.max(0, Math.min(previous.right, current.right) - Math.max(previous.left, current.left));
  if (Math.abs(current.top - previous.top) > smallerHeight * 0.45 && verticalOverlap2 / smallerHeight < 0.55 && horizontalOverlap2 / smallerWidth > 0.55) return true;
  }
  return false;
}
function hasDistinctPageLayout(rects) {
  const usefulRects = rects.filter((rect) => rect.width > 0 && rect.height > 0);
  for (let i = 0; i < usefulRects.length; i += 1) {
  for (let j = i + 1; j < usefulRects.length; j += 1) {
    const a = usefulRects[i];
    const b = usefulRects[j];
    const smallerWidth = Math.max(1, Math.min(a.width, b.width));
    const smallerHeight = Math.max(1, Math.min(a.height, b.height));
    const largerWidth = Math.max(a.width, b.width);
    const largerHeight = Math.max(a.height, b.height);
    if (smallerWidth / largerWidth < 0.55 || smallerHeight / largerHeight < 0.55) continue;
    const horizontalOverlap2 = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) / smallerWidth;
    const verticalOverlap2 = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / smallerHeight;
    const separatedHorizontally = Math.abs(a.left - b.left) > smallerWidth * 0.45 && horizontalOverlap2 < 0.55 && verticalOverlap2 > 0.55;
    const separatedVertically = Math.abs(a.top - b.top) > smallerHeight * 0.45 && verticalOverlap2 < 0.55 && horizontalOverlap2 > 0.55;
    if (separatedHorizontally || separatedVertically) return true;
  }
  }
  return false;
}
function isOnScreenViewportCanvas(canvas) {
  const viewport = canvas.closest(VIEWPORT_CONTAINER_SELECTOR);
  return viewport ? viewport.classList.contains(CURRENT_SCREEN_CLASS) : Boolean(canvas.closest(CURRENT_SCREEN_SELECTOR));
}
function hasBackgroundReaderSignal(element) {
  return element.hasAttribute("data-page-index") || Boolean(element.closest("[data-mokuro-reader]"));
}
function isLikelyBackgroundImagePage(element, hostname) {
  const knownHost = isKnownBackgroundImageReaderHost(hostname);
  if (!knownHost && !hasBackgroundReaderSignal(element)) return false;
  if (!backgroundImageReaderUrl(element)) return false;
  if (!hasRenderedPageShape(element.getBoundingClientRect())) return false;
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
  return isKnownCanvasReaderHost(hostname) || isKnownBackgroundImageReaderHost(hostname) || isCanvasReaderPage(hostname) || isBackgroundImageReaderPage(hostname);
}
const READER_RASTER_SIGNAL_SELECTOR = "[data-page-index], [data-mokuro-reader], [data-yomu-canvas-ocr]";
const READER_RASTER_CANDIDATE_NODE_SELECTOR = `canvas, ${PAGE_COUNTER_SELECTOR}, ${READER_RASTER_SIGNAL_SELECTOR}`;
const READER_RASTER_CANDIDATE_ATTRIBUTES = /* @__PURE__ */ new Set([
  "width",
  "height",
  "data-page-index",
  "data-mokuro-reader",
  "data-yomu-canvas-ocr"
]);
function pageHasReaderRasterCandidates(hostname = location.hostname) {
  if (isKnownCanvasReaderHost(hostname) || isKnownBackgroundImageReaderHost(hostname)) return true;
  if (document.querySelector(READER_RASTER_SIGNAL_SELECTOR)) return true;
  if (document.querySelector(PAGE_COUNTER_SELECTOR)) return true;
  for (const canvas of document.querySelectorAll("canvas")) {
  if (hasPageShape(canvas)) return true;
  }
  return false;
}
const pointerHitElements = /* @__PURE__ */ new WeakMap();
function ocrPointerHitElement(event) {
  const cached = pointerHitElements.get(event);
  if (cached) return cached.element;
  const hit = typeof event.clientX === "number" && typeof event.clientY === "number" ? document.elementFromPoint?.(event.clientX, event.clientY) ?? null : null;
  pointerHitElements.set(event, { element: hit });
  return hit;
}
function mutationsMayAddReaderRasterCandidate(mutations) {
  return mutationsTouchReaderRasterCandidates(mutations, "addedNodes");
}
function mutationsMayRemoveReaderRasterCandidate(mutations) {
  return mutationsTouchReaderRasterCandidates(mutations, "removedNodes");
}
function mutationsTouchReaderRasterCandidates(mutations, nodeList) {
  for (const mutation of mutations) {
  if (mutation.type === "attributes") {
    const attribute = mutation.attributeName;
    if (!attribute || !READER_RASTER_CANDIDATE_ATTRIBUTES.has(attribute)) continue;
    if (attribute === "width" || attribute === "height") {
      if (isCanvasNode(mutation.target)) return true;
      continue;
    }
    return true;
  }
  if (mutation.type !== "childList") continue;
  for (const node of mutation[nodeList]) {
    if (nodeIsOrContainsReaderRasterCandidate(node)) return true;
  }
  }
  return false;
}
function isCanvasNode(node) {
  return node.nodeType === Node.ELEMENT_NODE && node.localName === "canvas";
}
function nodeIsOrContainsReaderRasterCandidate(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = node;
  if (element.localName === "canvas") return true;
  if (element.matches(READER_RASTER_CANDIDATE_NODE_SELECTOR)) return true;
  return Boolean(element.querySelector(READER_RASTER_CANDIDATE_NODE_SELECTOR));
}
function canvasReaderPageCounter() {
  return document.querySelector(PAGE_COUNTER_SELECTOR)?.textContent?.trim() ?? "";
}
function canvasReaderPageSignature() {
  const canvases = pageCanvases();
  const counter = canvasReaderSignatureCounter(canvases);
  const tokens = canvasReaderContentTokens(canvases);
  const surfaces = tokens.length;
  const content = tokens.join(",");
  const backgrounds = backgroundImagePages().map((element) => `${element.getAttribute("data-page-index") ?? ""}:${backgroundImageReaderUrl(element) ?? ""}`).join("|");
  return `${counter}||${surfaces}|${content}|${backgrounds}`;
}
function canvasReaderSignatureCounter(canvases) {
  const counter = canvasReaderPageCounter();
  if (isBookwalkerViewerHost() && shouldIgnoreBookwalkerCounterForCanvasSignature(canvases)) return "";
  return counter;
}
function shouldIgnoreBookwalkerCounterForCanvasSignature(canvases) {
  try {
  if (new URL(location.href).searchParams.get("cty") === "2") {
    return hasVerticallyStackedDocumentPageRun(canvases);
  }
  } catch {
  }
  return hasVerticallyStackedDocumentPageRun(canvases);
}
function canvasPageContentToken(canvas) {
  try {
  const signature = canvasRenderedContentSignature(canvas);
  if (signature) return signature;
  } catch {
  }
  return canvasMirrorContentToken(canvas) || stableSurfaceToken(canvas) || canvasMirrorTurnToken();
}
function canvasReaderSurfaceId(canvas) {
  return bookwalkerVerticalSurface(canvas)?.id ?? canvas.closest(VIEWPORT_CONTAINER_SELECTOR)?.id ?? "";
}
function canvasReaderHasStableSurface(canvas) {
  return Boolean(bookwalkerVerticalSurface(canvas));
}
function stableSurfaceToken(canvas) {
  const id = bookwalkerVerticalSurface(canvas)?.id;
  return id ? `s:${id}:${canvas.width}x${canvas.height}` : "";
}
function bookwalkerVerticalSurface(canvas) {
  if (!isBookwalkerViewerHost()) return null;
  const surface = canvas.closest(BW_VERTICAL_SURFACE_SELECTOR);
  if (!surface) return null;
  if (surface.classList.contains("verticalAxis")) return surface;
  return surface.closest("#viewportW,.overScroll") ? surface : null;
}
function canvasReaderContentTokens(canvases) {
  const tokens = canvases.map((canvas) => {
  return attempt(() => canvasPageContentToken(canvas), "", "canvas-readers.canvasReaderContentTokens");
  });
  return [...new Set(tokens)].filter(Boolean);
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
  const context = markCanvasMirrorSkip(scaled.getContext("2d"));
  if (!context) return void 0;
  context.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  const dataUrl = scaled.toDataURL("image/jpeg", 0.86);
  releaseTransientCanvas(scaled);
  return dataUrl;
  } catch {
  return void 0;
  }
}
function releaseTransientCanvas(canvas) {
  attemptVoid(() => {
  canvas.width = 0;
  canvas.height = 0;
  }, "canvas-readers.releaseTransientCanvas");
}
function captureCanvasRegionDataUrl(canvas, surfaceRect, regionRect, maxPixels) {
  try {
  if (!canvas.width || !canvas.height || !surfaceRect.width || !surfaceRect.height) return void 0;
  const scaleX = canvas.width / surfaceRect.width;
  const scaleY = canvas.height / surfaceRect.height;
  const sx = Math.max(0, Math.round((regionRect.left - surfaceRect.left) * scaleX));
  const sy = Math.max(0, Math.round((regionRect.top - surfaceRect.top) * scaleY));
  const sw = Math.min(canvas.width - sx, Math.max(1, Math.round(regionRect.width * scaleX)));
  const sh = Math.min(canvas.height - sy, Math.max(1, Math.round(regionRect.height * scaleY)));
  if (sw <= 0 || sh <= 0) return void 0;
  const pixels = sw * sh;
  const scale = maxPixels > 0 && pixels > maxPixels ? Math.sqrt(maxPixels / pixels) : 1;
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const context = markCanvasMirrorSkip(out.getContext("2d"));
  if (!context) return void 0;
  context.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const dataUrl = out.toDataURL("image/jpeg", 0.86);
  releaseTransientCanvas(out);
  return dataUrl;
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
  let entries2;
  try {
  entries2 = performance.getEntriesByType("resource");
  } catch {
  return void 0;
  }
  const urls = entries2.map((entry) => entry.name).filter((url) => typeof url === "string" && !READER_PAGE_IMAGE_EXCLUDE.test(url));
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
const SCREENSHOT_MESSAGE_TIMEOUT_MS = 6e3;
const SCREENSHOT_PREFLIGHT_TIMEOUT_MS = 250;
const SCREENSHOT_DECODE_TIMEOUT_MS = 4e3;
let readerUiHideLeaseCount = 0;
async function captureReaderSurfaceViaExtensionScreenshot(surface, maxPixels) {
  if (!documentIsActiveForVisibleTabCapture()) return void 0;
  const rect = surface.getBoundingClientRect();
  const clip = visibleViewportIntersection(rect);
  if (!clip || clip.width < 2 || clip.height < 2) return void 0;
  const screenshot = await withReaderUiHidden(async () => {
  if (!documentIsActiveForVisibleTabCapture()) return void 0;
  return requestVisibleTabScreenshot();
  });
  if (!screenshot || !documentIsActiveForVisibleTabCapture()) return void 0;
  const cropped = await cropVisibleTabScreenshot(screenshot, clip, maxPixels);
  return cropped && documentIsActiveForVisibleTabCapture() ? { dataUrl: cropped, rect: new DOMRect(clip.left, clip.top, clip.width, clip.height) } : void 0;
}
function documentIsActiveForVisibleTabCapture() {
  return document.visibilityState === "visible" && document.hasFocus();
}
async function requestVisibleTabScreenshot() {
  const extension = extensionRuntime();
  if (!extension?.runtime.id || typeof extension.runtime.sendMessage !== "function") return void 0;
  const response = await sendExtensionMessage(extension, { type: CAPTURE_VISIBLE_TAB_MESSAGE, format: "jpeg", quality: 88 });
  return screenshotResponseDataUrl(response);
}
function sendExtensionMessage(extension, message) {
  return new Promise((resolve) => {
  let settled = false;
  const finish = (response) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    resolve(response);
  };
  const timer = window.setTimeout(() => finish(void 0), SCREENSHOT_MESSAGE_TIMEOUT_MS);
  try {
    const maybePromise = extension.promiseBased ? extension.runtime.sendMessage?.(message) : extension.runtime.sendMessage?.(message, (response) => {
      if (extension.runtime.lastError) finish(void 0);
      else finish(response);
    });
    if (isPromiseLike$1(maybePromise)) {
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
  const release = acquireReaderUiHideLease();
  try {
  await animationFrame();
  return await task();
  } finally {
  release();
  }
}
function acquireReaderUiHideLease() {
  if (readerUiHideLeaseCount === 0) {
  ensureScreenshotHideStyle();
  document.documentElement.dataset.yomuExtensionScreenshotCapture = "true";
  }
  readerUiHideLeaseCount += 1;
  let active = true;
  return () => {
  if (!active) return;
  active = false;
  readerUiHideLeaseCount = Math.max(0, readerUiHideLeaseCount - 1);
  if (readerUiHideLeaseCount > 0) return;
  delete document.documentElement.dataset.yomuExtensionScreenshotCapture;
  document.getElementById(SCREENSHOT_HIDE_STYLE_ID)?.remove();
  };
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
}
function animationFrame() {
  return new Promise((resolve) => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    resolve();
  };
  const timer = window.setTimeout(finish, SCREENSHOT_PREFLIGHT_TIMEOUT_MS);
  try {
    requestAnimationFrame(finish);
  } catch {
    finish();
  }
  });
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
  let settled = false;
  const finish = (error) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    if (error) reject(error);
    else resolve(image);
  };
  const timer = window.setTimeout(
    () => finish(new Error("Screenshot decode timed out.")),
    SCREENSHOT_DECODE_TIMEOUT_MS
  );
  image.onload = () => finish();
  image.onerror = () => finish(new Error("Screenshot decode failed."));
  try {
    image.src = dataUrl;
  } catch {
    finish(new Error("Screenshot decode failed."));
  }
  });
}
const BOOKWALKER_CONTENT_SESSION_PATHS = /* @__PURE__ */ new Set([
  "/browserWebApi/c",
  "/trial-page/c"
]);
const BOOKWALKER_AUTH_QUERY_KEYS = ["pfCd", "Policy", "Signature", "Key-Pair-Id"];
const SIGNED_URL_REFRESH_MARGIN_MS = 3e4;
const CONTENT_SESSION_TIMEOUT_MS = 6e3;
class BookwalkerAssetResolver {
  constructor(environment = browserEnvironment()) {
  this.environment = environment;
  }
  sessionEndpoint = "";
  refreshPending;
  rememberSessionEndpoint() {
  this.findSessionEndpoint();
  }
  async resolve(url) {
  if (!isBookwalkerAssetUrl(url)) return url;
  this.rememberSessionEndpoint();
  if (!bookwalkerSignedUrlNeedsRefresh(url, this.environment.now())) return url;
  return await this.refresh(url) ?? url;
  }
  async refresh(url) {
  if (!isBookwalkerAssetUrl(url)) return void 0;
  const endpoint = this.findSessionEndpoint();
  if (!endpoint) return void 0;
  const authorization = await this.loadAuthorization(endpoint);
  if (!authorization) {
    if (this.sessionEndpoint === endpoint) this.sessionEndpoint = "";
    return void 0;
  }
  return applyAuthorization(url, authorization);
  }
  findSessionEndpoint() {
  const current = safeUrl(this.environment.currentUrl());
  if (!current) return "";
  const contentId = current.searchParams.get("cid") ?? "";
  const candidate = this.environment.resourceUrls().slice().reverse().find((url) => isMatchingSessionEndpoint(url, current, contentId));
  if (candidate) this.sessionEndpoint = candidate;
  else if (!isMatchingSessionEndpoint(this.sessionEndpoint, current, contentId)) this.sessionEndpoint = "";
  return this.sessionEndpoint;
  }
  loadAuthorization(endpoint) {
  if (this.refreshPending?.endpoint === endpoint) return this.refreshPending.promise;
  const pending = this.environment.fetchJson(endpoint).then(parseContentAuthorization).catch(() => void 0).finally(() => {
    if (this.refreshPending?.promise === pending) this.refreshPending = void 0;
  });
  this.refreshPending = { endpoint, promise: pending };
  return pending;
  }
}
function bookwalkerSignedUrlNeedsRefresh(url, now = Date.now()) {
  const parsed = safeUrl(url);
  if (!parsed || !isBookwalkerHost(parsed.hostname)) return false;
  const expiresAt = signedUrlExpiry(parsed);
  return expiresAt !== void 0 && expiresAt <= now + SIGNED_URL_REFRESH_MARGIN_MS;
}
function browserEnvironment() {
  return {
  currentUrl: () => location.href,
  resourceUrls: () => {
    try {
      return performance.getEntriesByType("resource").map((entry) => entry.name).filter(Boolean);
    } catch {
      return [];
    }
  },
  fetchJson: async (url) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), CONTENT_SESSION_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        credentials: "include",
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`BookWalker content session returned ${response.status}.`);
      return response.json();
    } finally {
      window.clearTimeout(timer);
    }
  },
  now: () => Date.now()
  };
}
function isMatchingSessionEndpoint(rawUrl, current, contentId) {
  const candidate = safeUrl(rawUrl);
  if (!candidate || candidate.origin !== current.origin) return false;
  if (!BOOKWALKER_CONTENT_SESSION_PATHS.has(candidate.pathname)) return false;
  return !contentId || candidate.searchParams.get("cid") === contentId;
}
function parseContentAuthorization(value) {
  if (!value || typeof value !== "object") return void 0;
  const response = value;
  if (String(response.status ?? "") !== "200" || typeof response.url !== "string") return void 0;
  const baseUrl = safeUrl(response.url);
  if (!baseUrl || !isBookwalkerHost(baseUrl.hostname)) return void 0;
  if (!response.auth_info || typeof response.auth_info !== "object") return void 0;
  const source = response.auth_info;
  const query = /* @__PURE__ */ new Map();
  for (const key of BOOKWALKER_AUTH_QUERY_KEYS) {
  const entry = source[key];
  if (typeof entry === "string" && entry) query.set(key, entry);
  }
  return query.has("Policy") && query.has("Signature") && query.has("Key-Pair-Id") ? { baseUrl, query } : void 0;
}
function applyAuthorization(rawUrl, authorization) {
  const target = safeUrl(rawUrl);
  if (!target || target.origin !== authorization.baseUrl.origin) return void 0;
  if (!target.pathname.startsWith(authorization.baseUrl.pathname)) return void 0;
  for (const key of BOOKWALKER_AUTH_QUERY_KEYS) target.searchParams.delete(key);
  for (const [key, value] of authorization.query) target.searchParams.set(key, value);
  return target.toString();
}
function signedUrlExpiry(url) {
  const expires = Number(url.searchParams.get("Expires"));
  if (Number.isFinite(expires) && expires > 0) return expires * 1e3;
  const policy = url.searchParams.get("Policy");
  if (!policy) return void 0;
  try {
  const normalized = policy.replace(/-/g, "+").replace(/_/g, "=").replace(/~/g, "/");
  const decoded = atob(normalized);
  const parsed = JSON.parse(decoded);
  const epoch = Number(parsed.Statement?.[0]?.Condition?.DateLessThan?.["AWS:EpochTime"]);
  return Number.isFinite(epoch) && epoch > 0 ? epoch * 1e3 : void 0;
  } catch {
  return void 0;
  }
}
function isBookwalkerAssetUrl(rawUrl) {
  const url = safeUrl(rawUrl);
  if (!url || !isBookwalkerHost(url.hostname)) return false;
  return url.searchParams.has("Policy") && url.searchParams.has("Signature") && url.searchParams.has("Key-Pair-Id");
}
function isBookwalkerHost(hostname) {
  return hostname === "bookwalker.jp" || hostname.endsWith(".bookwalker.jp");
}
function safeUrl(value) {
  try {
  return new URL(value, typeof location === "undefined" ? void 0 : location.href);
  } catch {
  return void 0;
  }
}
function isCanvasMirrorEpochOrEmpty(content) {
  return content === "" || /^\d+(?:,\d+)*$/.test(content);
}
function isStableSurfaceToken(content) {
  return content.startsWith("s:");
}
function identityForCanvas(canvas) {
  try {
  return canvasPageContentToken(canvas);
  } catch {
  return "";
  }
}
function isRealContentIdentity(identity) {
  if (isCanvasMirrorEpochOrEmpty(identity)) return false;
  if (isStableSurfaceToken(identity)) return false;
  return true;
}
function stableContentIdentityForCanvas(canvas) {
  if (!isBookwalkerViewerHost()) return "";
  const token = canvasReaderHasStableSurface(canvas) ? identityForCanvas(canvas) : canvasMirrorContentToken(canvas);
  return isRealContentIdentity(token) ? token : "";
}
function hasIdentityChanged(canvas, lastIdentity) {
  if (!lastIdentity) return false;
  const current = stableContentIdentityForCanvas(canvas);
  return Boolean(current && current !== lastIdentity);
}
function isRealContentChange(previousContent, nextContent) {
  if (previousContent === nextContent) return false;
  return isRealContentIdentity(previousContent) && isRealContentIdentity(nextContent);
}
function isSameRealContent(previousContent, nextContent) {
  if (previousContent !== nextContent) return false;
  return isRealContentIdentity(previousContent);
}
function isGlobalEpochTransition(previousContent, nextContent) {
  if (previousContent === nextContent) return false;
  return isCanvasMirrorEpochOrEmpty(previousContent) && isCanvasMirrorEpochOrEmpty(nextContent);
}
function canvasSurfaceSnapshotKey(canvas) {
  const surfaceId = canvasReaderSurfaceId(canvas);
  if (isBookwalkerViewerHost()) {
  return [
    canvasReaderHasStableSurface(canvas) ? "" : canvasReaderPageCounter(),
    surfaceId
  ].join("|");
  }
  return [
  canvasReaderHasStableSurface(canvas) ? "" : canvasReaderPageCounter(),
  surfaceId,
  canvas.width,
  canvas.height,
  canvasPageContentToken(canvas)
  ].join("|");
}
function canvasStablePageContentToken(canvas) {
  return stableContentIdentityForCanvas(canvas);
}
function canvasContentReadinessKey(canvas) {
  const surfaceId = canvasReaderSurfaceId(canvas);
  return [
  canvasReaderHasStableSurface(canvas) ? "" : canvasReaderPageCounter(),
  surfaceId,
  canvas.width,
  canvas.height,
  canvasPageContentToken(canvas)
  ].join("|");
}
function isSameCanvasReaderPageLocation(previous, next) {
  const previousParts = splitCanvasReaderSignature(previous);
  const nextParts = splitCanvasReaderSignature(next);
  if (!previousParts || !nextParts) return false;
  return previousParts.counter === nextParts.counter && previousParts.backgrounds === nextParts.backgrounds;
}
function hasDifferentRecordedCanvasReaderContent(previous, next) {
  const previousParts = splitCanvasReaderSignature(previous);
  const nextParts = splitCanvasReaderSignature(next);
  if (!previousParts || !nextParts) return false;
  return isRecordedCanvasReaderContent(previousParts.content) && isRecordedCanvasReaderContent(nextParts.content) && isRealContentChange(previousParts.content, nextParts.content);
}
function isRecordedCanvasReaderContent(content) {
  const tokens = content.split(",").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => token.startsWith("m:") || token.startsWith("o:"));
}
function hasSameRealCanvasReaderContent(previous, next) {
  const previousParts = splitCanvasReaderSignature(previous);
  const nextParts = splitCanvasReaderSignature(next);
  if (!previousParts || !nextParts) return false;
  return isSameRealContent(previousParts.content, nextParts.content);
}
function isCanvasMirrorEpochTransition(previous, next) {
  const previousParts = splitCanvasReaderSignature(previous);
  const nextParts = splitCanvasReaderSignature(next);
  if (!previousParts || !nextParts) return false;
  return isGlobalEpochTransition(previousParts.content, nextParts.content);
}
function hasSameStableCanvasReaderPageCounter(previous, next) {
  const previousParts = splitCanvasReaderSignature(previous);
  const nextParts = splitCanvasReaderSignature(next);
  if (!previousParts || !nextParts) return false;
  return previousParts.counter !== "" && previousParts.counter === nextParts.counter;
}
function shouldTrustStableBookwalkerPageCounter() {
  if (!isBookwalkerViewerHost()) return false;
  try {
  return new URL(location.href).searchParams.get("cty") !== "2";
  } catch {
  return true;
  }
}
function splitCanvasReaderSignature(signature) {
  const parts = signature.split("|");
  if (parts.length < 5) return null;
  const [counter, scroll, surfaces, content, ...backgroundParts] = parts;
  return {
  backgrounds: backgroundParts.join("|"),
  content: content ?? "",
  counter: counter ?? "",
  scroll: scroll ?? "",
  surfaces: surfaces ?? ""
  };
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
class OcrWordRenderStateRegistry {
  states = /* @__PURE__ */ new WeakMap();
  rememberLine(line, tokens) {
  const tokensByKey = new Map(tokens.map((token) => [ocrTokenRenderKey(token), token]));
  line.querySelectorAll(".jpdb-reader-word[data-vid][data-sid]").forEach((word) => {
    const token = tokensByKey.get(ocrRenderedWordKey(word));
    if (!token) return;
    this.states.set(word, {
      surface: word.dataset.surface || line.dataset.ocrText?.slice(token.start, token.end) || word.textContent || "",
      token
    });
  });
  }
  get(word) {
  return this.states.get(word);
  }
  reconcile(word, card, pitchClass) {
  const state2 = this.states.get(word);
  if (!state2) return;
  const previousSpelling = state2.token.card.spelling;
  const previousReading = state2.token.card.reading;
  const renderedState = word.dataset.cardState?.trim();
  state2.token.card = renderedState && !card.cardState.includes(renderedState) ? { ...card, cardState: [renderedState] } : card;
  if (previousSpelling !== state2.token.card.spelling || previousReading !== state2.token.card.reading) state2.token.rubies = [];
  state2.token.pitchClass = pitchClass;
  }
}
function ocrTokenRenderKey(token) {
  return `${token.start}:${token.end}:${token.card.vid}:${token.card.sid}`;
}
function ocrRenderedWordKey(word) {
  return `${word.dataset.tokenStart ?? ""}:${word.dataset.tokenEnd ?? ""}:${word.dataset.vid ?? ""}:${word.dataset.sid ?? ""}`;
}
const READER_PAINT_CONTAINER_SELECTOR = [
  "[data-jpdb-reader-root]",
  ".jpdb-reader-text-mirror",
  ".jpdb-reader-control-text-mirror",
  ".jpdb-reader-detached-reading-overlay",
  "[data-yomu-projected-reading]"
].join(",");
const READER_PAINT_ATTRIBUTE_SELECTOR = `${READER_PAINT_CONTAINER_SELECTOR},.jpdb-reader-word`;
function mutationContainsOnlyReaderPaint(mutation) {
  if (mutation.type !== "childList") {
  return nodeMatchesOrIsInside(mutation.target, READER_PAINT_ATTRIBUTE_SELECTOR);
  }
  if (nodeMatchesOrIsInside(mutation.target, READER_PAINT_CONTAINER_SELECTOR)) return true;
  const changed = [...mutation.addedNodes, ...mutation.removedNodes];
  return changed.length > 0 && changed.every((node) => nodeMatchesOrIsInside(node, READER_PAINT_CONTAINER_SELECTOR));
}
function nodeMatchesOrIsInside(node, selector) {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.matches(selector) || element?.closest(selector));
}
function classifyRenderableMediaMutations(observed) {
  const mutations = observed.filter((mutation) => !mutationContainsOnlyReaderPaint(mutation));
  let touchesRenderableMedia = false;
  let addedImage = false;
  for (const mutation of mutations) {
  if (!mutationTouchesRenderableMedia(mutation)) continue;
  touchesRenderableMedia = true;
  if (mutationAddsRenderableMedia(mutation)) {
    addedImage = true;
    break;
  }
  }
  return {
  mutations,
  touchesRenderableMedia,
  addedImage,
  restylesEverySurface: mutations.some(mutationCanRestyleEverySurface)
  };
}
function mutationTouchesRenderableMedia(mutation) {
  if (mutation.type === "childList") {
  return [...mutation.addedNodes, ...mutation.removedNodes].some(nodeContainsRenderableMedia);
  }
  return mutation.target instanceof Element && nodeContainsRenderableMedia(mutation.target);
}
function mutationAddsRenderableMedia(mutation) {
  return mutation.type === "childList" && [...mutation.addedNodes].some(nodeContainsRenderableMedia);
}
function mutationCanRestyleEverySurface(mutation) {
  const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
  if (target?.matches('style, link[rel~="stylesheet"]')) return true;
  if (mutation.type !== "childList") return false;
  return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node instanceof Element && (node.matches('style, link[rel~="stylesheet"]') || Boolean(node.querySelector('style, link[rel~="stylesheet"]'))));
}
function nodeContainsRenderableMedia(node) {
  return isRenderableMediaNode(node) || isBackgroundImageReaderNode(node) || hasRenderableMediaDescendant(node);
}
function isRenderableMediaNode(node) {
  return node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLCanvasElement || node instanceof HTMLSourceElement;
}
function isBackgroundImageReaderNode(node) {
  return node instanceof HTMLElement && Boolean(backgroundImageReaderUrl(node));
}
function hasRenderableMediaDescendant(node) {
  return node instanceof Element && Boolean(node.querySelector('img, video, source, canvas, [data-page-index], [style*="background-image"], [style*="background:"][style*="url("]'));
}
function isTerminalOcrStatus(status) {
  return status === "empty" || status === "failed";
}
const MAX_CACHE_ITEMS = 36;
const LOCAL_OCR_UNAVAILABLE_RETRY_MS = 15e3;
const OCR_STATUS_READY_DWELL_MS = 1e3;
const OCR_STATUS_FADE_MS = 360;
const READER_RASTER_RETRY_BASE_MS = 140;
const READER_RASTER_RETRY_MAX_MS = 1100;
const READER_RASTER_MAX_CAPTURE_ATTEMPTS = 8;
const READER_RASTER_MAX_COMMIT_MISMATCHES = 3;
const READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS = 3;
const READER_RASTER_EMPTY_RETRY_MS = 400;
const READER_RASTER_MAX_PROVIDER_ATTEMPTS = 3;
const READER_RASTER_PROVIDER_RETRY_BASE_MS = 350;
const READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS = 4e4;
const READER_RASTER_FRAME_LOAD_TIMEOUT_MS = 8e3;
const BOOKWALKER_RECORDER_BOOT_GRACE_MS = 15e3;
const READER_RASTER_SAME_PAGE_SIGNATURE_HOLD_LIMIT = 40;
const READER_RASTER_BOTTOM_CHROME_RESERVE_PX = 56;
const READER_RASTER_FRAME_SIZE_CHANGE_PX = 2;
const READER_RASTER_REGION_MIN_SIZE_PX = 96;
const READER_RASTER_REGION_FULL_PAGE_FRACTION = 0.88;
const MIRROR_IMAGE_FETCH_TIMEOUT_MS = 8e3;
const MAX_CLEAN_MIRROR_IMAGE_CACHE_ITEMS = 48;
const BOOKWALKER_SPREAD_MIN_ASPECT = 1.15;
const bookwalkerAssetResolver = new BookwalkerAssetResolver();
const log = Logger.scope("OCR");
const STALE_OCR_STATE = Symbol("stale-ocr-state");
const ocrVocabularyCache = /* @__PURE__ */ new WeakMap();
let ocrLayerCounter = 0;
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
const VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR = [
  '[data-yomu-inline-fullscreen="true"]',
  '[data-fullscreen-active="true"]',
  "[fullscreen]",
  "#movie_player.ytp-fullscreen",
  ".html5-video-player.ytp-fullscreen",
  "ytd-watch-flexy[fullscreen]",
  "ytm-player[fullscreen]",
  "ytm-player.fullscreen",
  "ytm-player.ytp-fullscreen"
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
function shouldPinOcrLineFromPointer(event) {
  return event.pointerType === "touch" || event.pointerType === "pen";
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
  const token = claimOcrScan(state2);
  const provider = inlineProviderLabel(settings);
  return {
  provider,
  done: log.time("scanImage", { provider, image: imageSummary(image), manualRequested }),
  token
  };
}
function renderNoOcrLines(state2) {
  state2.autoSkipped = true;
  state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
}
function logOcrFailure(state2, provider, manualRequested, error) {
  state2.autoSkipped = !manualRequested;
  if (isLocalOcrUnavailableError(error)) {
  log.warnOnce(`local-ocr-unavailable:${error.endpointUrl}`, "Local OCR endpoint unavailable; pausing requests", { provider, endpoint: error.endpointUrl });
  return;
  }
  log.warn("OCR scan failed", { provider, manualRequested }, error);
}
const OCR_NAVIGATION_EVENTS = ["yt-navigate-start", "yt-navigate-finish", "popstate"];
const OCR_FULLSCREEN_CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange"];
const MINING_PAUSE_MARKER_TTL_MS = 1500;
function isFreshMiningPause(video) {
  const marked = Number(video.dataset.jpdbReaderMiningPause);
  return Number.isFinite(marked) && Date.now() - marked < MINING_PAUSE_MARKER_TTL_MS;
}
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
  // Small bounded pool; inFlightJobs also deduplicates identical image content.
  activeScans = 0;
  // Tokens stop a stale scan deleting a newer job's marker.
  inFlightJobs = /* @__PURE__ */ new Map();
  positionFrame = 0;
  refreshTimer = 0;
  destroyed = false;
  pageScannerIsolationEnabled;
  lastPointerMoveImage;
  lastPointerMoveReaderSurface;
  lastPointerMoveReaderSurfaceKey;
  videoFrames = /* @__PURE__ */ new Map();
  videoFrameVideos = /* @__PURE__ */ new Map();
  videoFrameControls = /* @__PURE__ */ new Map();
  videoFrameStatuses = /* @__PURE__ */ new Map();
  imageStatuses = /* @__PURE__ */ new Map();
  imageStatusTimers = /* @__PURE__ */ new Map();
  // Reader surfaces map to the invisible images OCR actually scans.
  canvasFrames = /* @__PURE__ */ new Map();
  canvasFrameSources = /* @__PURE__ */ new Map();
  canvasFrameStaticRects = /* @__PURE__ */ new Map();
  canvasFrameRegionFractions = /* @__PURE__ */ new Map();
  canvasFrameKeys = /* @__PURE__ */ new Map();
  canvasFrameContentTokens = /* @__PURE__ */ new Map();
  canvasFrameLoadTimers = /* @__PURE__ */ new Map();
  canvasPendingStatuses = /* @__PURE__ */ new Map();
  canvasPendingStatusKeys = /* @__PURE__ */ new Map();
  // Explicitly tapped frames survive native-text-layer polling until a real turn.
  canvasFrameUserRequested = /* @__PURE__ */ new Set();
  backgroundFrames = /* @__PURE__ */ new Map();
  backgroundFrameSources = /* @__PURE__ */ new Map();
  backgroundFrameKeys = /* @__PURE__ */ new Map();
  canvasReaderSignature;
  canvasReaderSamePageSignatureSkips = 0;
  // Keeps viewport shifts O(1) on pages proven free of reader rasters.
  readerRasterFreeMemo;
  readerRasterPoll = 0;
  readerRasterRetryTimer = 0;
  pendingCanvasSnapshots = /* @__PURE__ */ new Map();
  // Stable-location keys survive equivalent NFBR canvas-node swaps.
  canvasContentReadiness = /* @__PURE__ */ new Map();
  canvasCaptureAttempts = /* @__PURE__ */ new Map();
  canvasMirrorWaitStartedAt = /* @__PURE__ */ new Map();
  canvasCommitMismatches = /* @__PURE__ */ new Map();
  // A recycled canvas reopens terminally paused capture for genuinely new content.
  canvasFailureContentTokens = /* @__PURE__ */ new Map();
  readerRasterEmptyScans = /* @__PURE__ */ new Map();
  readerRasterFailedScans = /* @__PURE__ */ new Set();
  readerRasterProviderFailures = /* @__PURE__ */ new Map();
  readerRasterProviderRetryTimers = /* @__PURE__ */ new Map();
  // Bounded tap-mode retries survive late repaint/signature churn without enabling auto-OCR.
  canvasTapRecapture = /* @__PURE__ */ new Map();
  ocrWordRenderStates = new OcrWordRenderStateRegistry();
  pointerActivatedOcrLines = /* @__PURE__ */ new WeakMap();
  replacementOcrLines = /* @__PURE__ */ new WeakMap();
  lookupLineLeases = /* @__PURE__ */ new Map();
  recentTouchOcrPoint;
  handleMediaPause = (event) => this.snapshotPausedVideo(event.target);
  handleManualFrameRequest = (event) => {
  const video = event.detail?.video;
  if (video) this.snapshotPausedVideo(video, true);
  };
  handleMediaResume = (event) => this.releaseVideoFrame(event.target);
  handleMediaSeeked = (event) => this.refreshVideoFrameAfterSeek(event.target);
  handleDocumentPointerDown = (event) => {
  this.unpinOcrLinesFromDocumentEvent(event);
  this.requestOcrFromPointerEvent(event);
  };
  handleDocumentTouchStart = (event) => {
  this.unpinOcrLinesFromDocumentEvent(event);
  this.requestOcrFromTouchEvent(event);
  };
  handleDocumentPointerOver = (event) => this.requestOcrFromPointerEvent(event);
  handleDocumentPointerMove = (event) => this.requestOcrFromPointerEvent(event);
  handleDocumentClick = (event) => this.unpinOcrLinesFromDocumentEvent(event);
  handleDocumentScroll = () => this.handleOcrViewportShift(120);
  handleWindowScroll = () => this.handleOcrViewportShift(240);
  handleWindowResize = () => {
  forgetAllComposedOcrSurfaceTransforms();
  this.handleOcrViewportShift(300);
  };
  handleVisualViewportResize = () => {
  forgetAllComposedOcrSurfaceTransforms();
  this.handleOcrViewportShift(120);
  };
  handleSpaNavigation = () => this.teardownForNavigation();
  init() {
  this.destroyed = false;
  forgetAllComposedOcrSurfaceTransforms();
  this.readerRasterFreeMemo = void 0;
  const body = document.body;
  if (!body) {
    document.addEventListener("DOMContentLoaded", () => {
      if (!this.destroyed) this.init();
    }, { once: true });
    return;
  }
  this.refresh();
  document.addEventListener("pointerdown", this.handleDocumentPointerDown, true);
  document.addEventListener("touchstart", this.handleDocumentTouchStart, { capture: true, passive: true });
  document.addEventListener("pointerover", this.handleDocumentPointerOver, true);
  document.addEventListener("pointermove", this.handleDocumentPointerMove, true);
  document.addEventListener("click", this.handleDocumentClick, true);
  document.addEventListener("pause", this.handleMediaPause, true);
  document.addEventListener("yomu-ocr-video-frame-request", this.handleManualFrameRequest, true);
  document.addEventListener("play", this.handleMediaResume, true);
  document.addEventListener("emptied", this.handleMediaResume, true);
  document.addEventListener("seeked", this.handleMediaSeeked, true);
  document.addEventListener("scroll", this.handleDocumentScroll, { capture: true, passive: true });
  window.addEventListener("scroll", this.handleWindowScroll, { passive: true });
  window.addEventListener("resize", this.handleWindowResize, { passive: true });
  window.addEventListener("orientationchange", this.handleWindowResize, { passive: true });
  for (const eventName of OCR_FULLSCREEN_CHANGE_EVENTS) {
    document.addEventListener(eventName, this.handleWindowResize, true);
  }
  window.visualViewport?.addEventListener("resize", this.handleVisualViewportResize, { passive: true });
  window.visualViewport?.addEventListener("scroll", this.handleDocumentScroll, { passive: true });
  for (const eventName of OCR_NAVIGATION_EVENTS) {
    window.addEventListener(eventName, this.handleSpaNavigation);
  }
  this.mutationObserver = new MutationObserver((mutations) => this.handleRenderableMediaMutations(mutations));
  this.mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class", "hidden", "src", "srcset", "sizes", "loading", "poster", "width", "height", "data-yomu-canvas-ocr", "data-page-index", "data-mokuro-reader"]
  });
  this.startReaderRasterPollingIfNeeded();
  }
  destroy() {
  this.destroyed = true;
  document.removeEventListener("pointerdown", this.handleDocumentPointerDown, true);
  document.removeEventListener("touchstart", this.handleDocumentTouchStart, true);
  document.removeEventListener("pointerover", this.handleDocumentPointerOver, true);
  document.removeEventListener("pointermove", this.handleDocumentPointerMove, true);
  document.removeEventListener("click", this.handleDocumentClick, true);
  document.removeEventListener("pause", this.handleMediaPause, true);
  document.removeEventListener("yomu-ocr-video-frame-request", this.handleManualFrameRequest, true);
  document.removeEventListener("play", this.handleMediaResume, true);
  document.removeEventListener("emptied", this.handleMediaResume, true);
  document.removeEventListener("seeked", this.handleMediaSeeked, true);
  document.removeEventListener("scroll", this.handleDocumentScroll, true);
  window.removeEventListener("scroll", this.handleWindowScroll);
  window.removeEventListener("resize", this.handleWindowResize);
  window.removeEventListener("orientationchange", this.handleWindowResize);
  for (const eventName of OCR_FULLSCREEN_CHANGE_EVENTS) {
    document.removeEventListener(eventName, this.handleWindowResize, true);
  }
  window.visualViewport?.removeEventListener("resize", this.handleVisualViewportResize);
  window.visualViewport?.removeEventListener("scroll", this.handleDocumentScroll);
  for (const eventName of OCR_NAVIGATION_EVENTS) {
    window.removeEventListener(eventName, this.handleSpaNavigation);
  }
  this.releaseAllVideoFrames();
  this.releaseAllCanvasFrames();
  this.canvasTapRecapture.clear();
  this.releaseAllBackgroundFrames();
  for (const pending of this.pendingCanvasSnapshots.values()) pending.cancelled = true;
  this.pendingCanvasSnapshots.clear();
  if (this.readerRasterPoll) {
    window.clearInterval(this.readerRasterPoll);
    this.readerRasterPoll = 0;
  }
  if (this.readerRasterRetryTimer) {
    window.clearTimeout(this.readerRasterRetryTimer);
    this.readerRasterRetryTimer = 0;
  }
  this.mutationObserver?.disconnect();
  if (this.positionFrame) window.cancelAnimationFrame(this.positionFrame);
  this.clear();
  }
  refresh(options = {}) {
  if (this.destroyed) return;
  const settings = this.options.getSettings();
  this.syncPageScannerIsolation(settings);
  if (!ocrRuntimeActive(settings)) {
    this.releaseAllVideoFrames();
    this.clear();
    return;
  }
  this.refreshCanvasReaderSurfaces(settings, options.userRequested);
  this.refreshBackgroundImageReaderSurfaces(settings, options.userRequested);
  if (!this.canScanInlineImages(Boolean(options.userRequested))) {
    this.releaseInlineImageStates();
    this.pruneDisconnectedStates();
    this.schedulePosition();
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
  if (!ocrRuntimeActive(settings)) return;
  if (this.options.shouldAutoScan?.() === false && !hasCanvasOcrOptInSurface()) {
    this.clearAutoScannedOverlays();
    this.schedulePosition();
    return;
  }
  this.refresh();
  }
  refreshForModeChange() {
  if (this.destroyed) return;
  const settings = this.options.getSettings();
  this.syncPageScannerIsolation(settings);
  if (!ocrRuntimeActive(settings)) {
    this.releaseAllVideoFrames();
    this.clear();
    return;
  }
  if (!settings.ocrAutoScanImages) {
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
  const batch = classifyRenderableMediaMutations(mutations);
  if (!batch.mutations.length) return;
  this.invalidatePositionTransformsForMutations(batch);
  const settings = this.options.getSettings();
  if (!ocrRuntimeActive(settings)) {
    this.readerRasterFreeMemo = void 0;
    return;
  }
  const memo = this.readerRasterFreeMemo;
  if (memo && (memo.free ? mutationsMayAddReaderRasterCandidate(batch.mutations) : mutationsMayRemoveReaderRasterCandidate(batch.mutations))) {
    this.readerRasterFreeMemo = void 0;
  }
  if (!batch.touchesRenderableMedia) return;
  this.schedulePosition();
  if (!canAutoRefreshOcrAfterMutation(settings, this.options.shouldAutoScan)) return;
  this.scheduleRefresh(batch.addedImage ? 0 : 40);
  }
  invalidatePositionTransformsForMutations(batch) {
  if (batch.restylesEverySurface) {
    forgetAllComposedOcrSurfaceTransforms();
    return;
  }
  for (const image of this.states.keys()) {
    const surface = this.ocrLayerTransformSurface(image);
    if (surface && batch.mutations.some(({ target }) => {
      const element = target instanceof Element ? target : target.parentElement;
      return element === surface || Boolean(element?.contains(surface));
    })) {
      forgetComposedOcrSurfaceTransform(surface);
    }
  }
  }
  handleOcrViewportShift(refreshDelay) {
  if (!ocrRuntimeActive(this.options.getSettings())) return;
  this.schedulePosition();
  if (this.hasReaderRasterSurfaces()) {
    this.scheduleReaderRasterRefresh(refreshDelay);
    return;
  }
  this.scheduleRefresh(refreshDelay);
  }
  hasReaderRasterSurfaces() {
  if (this.canvasFrames.size > 0 || this.canvasPendingStatuses.size > 0 || this.backgroundFrames.size > 0) return true;
  if (this.isProvenRasterFreePage()) return false;
  return isReaderRasterPage();
  }
  hasReaderRasterCaptureWork() {
  return this.canvasFrames.size > 0 || this.canvasPendingStatuses.size > 0 || this.backgroundFrames.size > 0 || isReaderRasterPage();
  }
  hasTrackedManualCanvasSurface() {
  for (const canvas of this.canvasFrames.keys()) {
    if (isManualCanvasReaderSurface(canvas)) return true;
  }
  for (const canvas of this.canvasPendingStatuses.keys()) {
    if (isManualCanvasReaderSurface(canvas)) return true;
  }
  return false;
  }
  // A "free" verdict is provable from layout-free facts alone and stays valid
  // until a mutation could add a candidate (observer invalidates) or the SPA
  // navigates (href key). A "not free" verdict just means the full sweeps must
  // run, exactly as before the memo existed — canvas paint can change their
  // answer without any DOM mutation, so it is never trusted beyond that.
  isProvenRasterFreePage() {
  const memo = this.readerRasterFreeMemo;
  if (memo && memo.href === location.href) return memo.free;
  const free = !pageHasReaderRasterCandidates();
  this.readerRasterFreeMemo = { href: location.href, free };
  return free;
  }
  hasVisibleInlineOcrFallback(settings) {
  if (!this.canScanInlineImages(false)) return false;
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
  this.resetStateIfImageChanged(state2);
  this.observer?.observe(image);
  if (this.shouldAutoEnqueueImage(image, state2, settings)) this.enqueue(image);
  }
  shouldAutoEnqueueImage(image, state2, settings) {
  return (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) && isOcrImageStateIdle(state2) && isNearViewport(image, imagePrefetchMargin(settings));
  }
  canAutoScanImage(settings) {
  return settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false;
  }
  canScanInlineImages(userRequested) {
  if (!userRequested && this.hasActiveReaderRasterOwnership()) return false;
  return this.options.shouldScanInlineImages?.(userRequested) !== false;
  }
  hasActiveReaderRasterOwnership() {
  return this.canvasFrames.size > 0 || this.canvasPendingStatuses.size > 0 || this.pendingCanvasSnapshots.size > 0 || this.backgroundFrames.size > 0;
  }
  async scanVisible() {
  this.readerRasterFreeMemo = void 0;
  const settings = this.options.getSettings();
  const retriedReaderFrames = this.retryVisibleReaderRasterFrames(settings);
  this.refresh({ userRequested: true });
  if (!this.canScanInlineImages(true)) {
    if (!retriedReaderFrames) this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, "ocrNoReadableImages"));
    return;
  }
  const images = [...this.states.keys()].filter((image) => isCandidateImage(image, settings) && isNearViewport(image, 120));
  if (!images.length) {
    if (!retriedReaderFrames && !this.hasReaderRasterCaptureWork()) {
      this.options.onToast(uiText(this.options.getSettings().interfaceLanguage, "ocrNoReadableImages"));
    }
    return;
  }
  images.forEach((image) => this.enqueue(image, true));
  log.info("Manual OCR scan queued images", { images: images.length });
  }
  captureSourceImageForElement(element) {
  const staleLine = element?.closest?.(".jpdb-ocr-line");
  if (!staleLine) return void 0;
  const line = this.currentOcrLine(staleLine);
  const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
  if (!state2) return void 0;
  const image = captureImageElement(state2.image);
  return image;
  }
  pinLineForElement(element) {
  const staleLine = element?.closest?.(".jpdb-ocr-line");
  if (!staleLine) return;
  const line = this.currentOcrLine(staleLine);
  const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
  if (state2) this.pinLine(state2, line);
  }
  unpinLineForElement(element) {
  const staleLine = element?.closest?.(".jpdb-ocr-line");
  const line = staleLine ? this.currentOcrLine(staleLine) : void 0;
  if (line?.dataset.pinned === "true") this.unpinLine(line);
  }
  retainLineForLookup(element) {
  const staleLine = element?.closest?.(".jpdb-ocr-line");
  if (!staleLine) return void 0;
  const line = this.currentOcrLine(staleLine);
  const state2 = [...this.states.values()].find((candidate) => candidate.overlay.contains(line));
  const lease = { line };
  const leases = this.lookupLineLeases.get(line) ?? /* @__PURE__ */ new Set();
  leases.add(lease);
  this.lookupLineLeases.set(line, leases);
  if (state2) this.activateOcrLineMarkup(state2, line);
  this.syncOcrLineActiveState(line);
  if (state2) this.schedulePosition();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const currentLine = lease.line;
    lease.line = void 0;
    if (!currentLine) return;
    const current = this.lookupLineLeases.get(currentLine);
    if (!current?.delete(lease)) return;
    if (current.size === 0) this.lookupLineLeases.delete(currentLine);
    this.syncOcrLineActiveState(currentLine);
    if (state2) this.schedulePosition();
  };
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
  this.observer = new IntersectionObserver((entries2) => {
    for (const entry of entries2) {
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
  this.mountOcrOverlayForImage(overlay, image);
  const state2 = { image, overlay, key: imageCacheKey(image), target: captureOcrTargetContext(), loading: false, overlayRequested: false, manualRequested: false, autoSkipped: false };
  const loadListener = () => {
    this.resetStateIfImageChanged(state2);
    this.schedulePosition();
    this.scheduleRefresh(0);
  };
  state2.loadListener = loadListener;
  image.addEventListener("load", loadListener);
  this.states.set(image, state2);
  if (image.complete && image.naturalWidth > 0) {
    this.schedulePosition();
    const settings = this.options.getSettings();
    if (this.canAutoScanImage(settings) || settings.ocrAutoScanImages && hasInlineOcrFallback(image)) this.enqueue(image);
  }
  return state2;
  }
  mountOcrOverlayForImage(overlay, image) {
  const video = this.videoFrameVideos.get(image);
  appendOcrArtifactToRoot(overlay, video ? videoFrameArtifactRoot(video) : document.body);
  }
  enqueue(image, userRequested = false) {
  if (isYouTubeThumbnailImage(image)) return;
  const state2 = this.states.get(image) ?? this.ensureState(image);
  this.resetStateIfImageChanged(state2);
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
  if (this.isDuplicateTouchPointerOcrEvent(event)) return false;
  const settings = this.options.getSettings();
  const image = ocrImageFromPointerEvent(event, settings);
  if (image) {
    if (!this.canScanInlineImages(true)) return false;
    if (event.type === "pointermove" && image === this.lastPointerMoveImage) return false;
    if (event.type === "pointermove") this.lastPointerMoveImage = image;
    else this.lastPointerMoveImage = void 0;
    this.lastPointerMoveReaderSurface = void 0;
    this.lastPointerMoveReaderSurfaceKey = void 0;
    this.enqueue(image, true);
    return true;
  }
  const surface = ocrReaderSurfaceFromPointerEvent(event, settings, this.isProvenRasterFreePage());
  if (!surface) return false;
  const autoOwnsSurface = settings.ocrAutoScanImages && this.options.shouldAutoScan?.() !== false && !(surface instanceof HTMLCanvasElement && isManualCanvasReaderSurface(surface));
  if (autoOwnsSurface) return false;
  const surfaceKey = readerRasterSurfaceSnapshotKey(surface);
  if (event.type === "pointermove" && surface === this.lastPointerMoveReaderSurface && surfaceKey === this.lastPointerMoveReaderSurfaceKey) return false;
  if (event.type === "pointermove") {
    this.lastPointerMoveReaderSurface = surface;
    this.lastPointerMoveReaderSurfaceKey = surfaceKey;
  } else {
    this.lastPointerMoveReaderSurface = void 0;
    this.lastPointerMoveReaderSurfaceKey = void 0;
  }
  void this.snapshotReaderSurface(surface, settings);
  return true;
  }
  requestOcrFromTouchEvent(event) {
  const point = touchPointFromEvent(event);
  if (!point) return;
  if (this.requestOcrFromPointerEvent(eventWithPoint(event, point))) {
    this.recentTouchOcrPoint = { ...point, at: Date.now() };
  }
  }
  isDuplicateTouchPointerOcrEvent(event) {
  if (event.type !== "pointerdown" || !isPointerLikeEvent(event) || event.pointerType !== "touch") return false;
  const recent = this.recentTouchOcrPoint;
  if (!recent) return false;
  if (Date.now() - recent.at > 700) {
    this.recentTouchOcrPoint = void 0;
    return false;
  }
  return Math.abs(event.clientX - recent.clientX) <= 6 && Math.abs(event.clientY - recent.clientY) <= 6;
  }
  async snapshotReaderSurface(surface, settings) {
  if (surface instanceof HTMLCanvasElement) {
    const existing2 = this.canvasFrames.get(surface);
    if (existing2?.complete && existing2.naturalWidth > 0) {
      this.enqueue(existing2, true);
      return;
    }
    await this.snapshotCanvasSurface(surface, settings, true);
    return;
  }
  const existing = this.backgroundFrames.get(surface);
  if (existing?.complete && existing.naturalWidth > 0) {
    this.enqueue(existing, true);
    return;
  }
  this.snapshotBackgroundImageSurface(surface, settings, true);
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
  // Hold duplicate content until the in-flight scan fills its shared cache entry.
  takeNextQueuedImage() {
  for (let index = 0; index < this.queue.length; index++) {
    const candidate = this.queue[index];
    if (this.inFlightJobs.has(ocrTargetWorkKey(imageCacheKey(candidate)))) continue;
    this.queue.splice(index, 1);
    return candidate;
  }
  return void 0;
  }
  startScan(image) {
  if (this.destroyed) return;
  const target = captureOcrTargetContext();
  const work = ocrTargetWork(imageCacheKey(image), target);
  const key = work.workKey;
  const job = Symbol(key);
  this.activeScans++;
  this.inFlightJobs.set(key, job);
  const hasFastText = Boolean(readFallbackOcrResult(image, false));
  const isReaderRasterFrame = this.isReaderRasterFrame(image);
  const delay = this.cache.has(work.cacheKey) || this.states.get(image)?.overlayRequested || hasFastText || isReaderRasterFrame || this.videoFrameVideos.has(image) ? 0 : 900;
  void waitForIdle(delay, delay).then(() => this.scanImage(image, target)).catch((error) => {
    if (isStaleOcrState(error)) return;
    log.warn("OCR scan task failed unexpectedly", {}, error);
  }).finally(() => {
    this.activeScans = Math.max(0, this.activeScans - 1);
    if (this.inFlightJobs.get(key) === job) this.inFlightJobs.delete(key);
    if (!this.destroyed) this.drainQueue();
  });
  }
  async scanImage(image, target = captureOcrTargetContext()) {
  if (this.destroyed) return;
  target.requireCurrent(STALE_OCR_STATE);
  if (!ocrRuntimeActive(this.options.getSettings())) return;
  const existingState = this.states.get(image);
  if (!image.isConnected) {
    if (existingState) this.releaseImageState(image, existingState);
    return;
  }
  const state2 = existingState ?? this.ensureState(image);
  const settings = this.options.getSettings();
  const manualRequested = state2.manualRequested;
  this.resetStateIfImageChanged(state2);
  const work = ocrTargetWork(state2.key, target);
  if (await this.tryRenderCachedOcrResult(state2, work)) return;
  if (!this.isCurrentContentState(state2, work.contentKey)) return;
  this.updateOcrStatus(image, "loading");
  const scan = beginOcrScan(state2, image, settings, manualRequested);
  try {
    await this.scanUncachedImage(state2, image, work, settings, scan.provider, manualRequested);
  } catch (error) {
    if (isStaleOcrState(error)) return;
    try {
      await this.renderOcrFailure(state2, image, work, scan.provider, manualRequested, error);
    } catch (renderError) {
      if (isStaleOcrState(renderError)) return;
      throw renderError;
    }
  } finally {
    releaseOcrScan(state2, scan.token);
    scan.done();
  }
  }
  async renderCachedOcrResult(state2, work) {
  work.target.requireCurrent(STALE_OCR_STATE);
  if (this.isReaderRasterFrame(state2.image) && !state2.manualRequested && this.readerRasterFailedScans.has(work.workKey)) {
    this.requireCurrentContentState(state2, work.contentKey);
    this.renderNoOcrLines(state2);
    this.updateOcrStatus(state2.image, "failed");
    state2.manualRequested = false;
    return true;
  }
  if (!this.cache.has(work.cacheKey)) return false;
  if (this.shouldSuppressAutoRenderedResult(state2, false)) {
    this.clearAutoScannedOverlays();
    return true;
  }
  const cached = this.cache.get(work.cacheKey);
  this.requireCurrentContentState(state2, work.contentKey);
  if (!cached) {
    if (this.isReaderRasterFrame(state2.image)) {
      const emptyScanKey = this.readerRasterEmptyScanKey(state2, work);
      if ((this.readerRasterEmptyScans.get(emptyScanKey) ?? 0) >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) {
        this.renderNoOcrLines(state2);
        this.updateOcrStatus(state2.image, "empty");
        state2.manualRequested = false;
        return true;
      }
      this.forget(work.cacheKey);
      return false;
    }
    if (this.shouldPreserveReaderRasterResult(state2)) return true;
    this.renderNoOcrLines(state2);
    this.updateOcrStatus(state2.image, "empty");
    state2.manualRequested = false;
    return true;
  }
  await this.renderResult(state2, cached, false, work);
  state2.manualRequested = false;
  return true;
  }
  async tryRenderCachedOcrResult(state2, work) {
  try {
    return await this.renderCachedOcrResult(state2, work);
  } catch (error) {
    if (isStaleOcrState(error)) return true;
    throw error;
  }
  }
  async scanUncachedImage(state2, image, work, settings, provider, manualRequested) {
  const inlineFallback = readFallbackOcrResult(image, false);
  const providerResult = inlineFallback ? null : await promiseWithTimeout(
    this.recognizeImage(image, settings),
    ocrAttemptTimeoutMs(settings, this.options.ocrAttemptTimeoutFloorMs),
    "OCR timed out."
  );
  work.target.requireCurrent(STALE_OCR_STATE);
  this.requireCurrentContentState(state2, work.contentKey);
  const result = inlineFallback ?? providerResult;
  if (!result?.lines.length) {
    this.readerRasterFailedScans.delete(work.workKey);
    this.clearReaderRasterProviderRetry(work.workKey);
    if (this.shouldPreserveReaderRasterResult(state2)) {
      this.updateOcrStatus(image, "ready");
      return;
    }
    const readerRasterEmptyAttempts = this.isReaderRasterFrame(image) ? this.recordReaderRasterEmptyScan(state2, work, manualRequested) : 0;
    if (this.isReaderRasterFrame(image)) {
      if (!manualRequested && readerRasterEmptyAttempts >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) {
        this.remember(work.cacheKey, null);
      } else {
        this.forget(work.cacheKey);
      }
    } else {
      this.remember(work.cacheKey, null);
    }
    this.requireCurrentContentState(state2, work.contentKey);
    this.renderNoOcrLines(state2);
    this.updateOcrStatus(
      image,
      this.isReaderRasterFrame(image) && readerRasterEmptyAttempts < READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS ? "loading" : "empty"
    );
    return;
  }
  this.remember(work.cacheKey, result);
  this.readerRasterEmptyScans.delete(this.readerRasterEmptyScanKey(state2, work));
  this.readerRasterFailedScans.delete(work.workKey);
  this.clearReaderRasterProviderRetry(work.workKey);
  this.requireCurrentContentState(state2, work.contentKey);
  if (this.shouldSuppressAutoRenderedResult(state2, Boolean(inlineFallback), manualRequested)) {
    this.clearAutoScannedOverlays();
    return;
  }
  await this.renderResult(state2, result, false, work);
  log.info("OCR result rendered", { provider, lines: result.lines.length, manualRequested });
  }
  shouldSuppressAutoRenderedResult(state2, inlineFallback, manualRequested = state2.manualRequested) {
  return !manualRequested && !state2.overlayRequested && !inlineFallback && !this.isReaderRasterOcrOptInFrame(state2.image) && this.options.shouldAutoScan?.() === false;
  }
  isReaderRasterOcrOptInFrame(image) {
  const canvas = this.canvasFrameSources.get(image);
  return Boolean(canvas && isCanvasOcrOptInSurface(canvas));
  }
  async renderOcrFailure(state2, image, work, provider, manualRequested, error) {
  work.target.requireCurrent(STALE_OCR_STATE);
  this.requireCurrentContentState(state2, work.contentKey);
  const fallback = readFallbackOcrResult(image, false);
  if (fallback?.lines.length) {
    log.warn("OCR provider failed", { provider }, error);
    this.readerRasterFailedScans.delete(work.workKey);
    this.clearReaderRasterProviderRetry(work.workKey);
    await this.renderResult(state2, fallback, false, work);
    return;
  }
  if (this.isReaderRasterFrame(image) && this.scheduleReaderRasterProviderRetry(state2, work, manualRequested, error)) {
    this.updateOcrStatus(image, "loading");
    return;
  }
  if (this.isReaderRasterFrame(image)) {
    this.clearReaderRasterProviderRetry(work.workKey);
    this.rememberReaderRasterFailure(work.workKey);
  }
  logOcrFailure(state2, provider, manualRequested, error);
  this.updateOcrStatus(image, "failed");
  }
  recognizeImage(image, settings) {
  const recognizer = ocrRecognizer(settings);
  if (!recognizer) return Promise.resolve(null);
  if (this.shouldSplitBookwalkerSpreadFrame(image)) return this.recognizeBookwalkerSpreadFrame(image, settings, recognizer);
  return this.recognizeWithDarkPass(image, settings, recognizer);
  }
  shouldSplitBookwalkerSpreadFrame(image) {
  const canvas = this.canvasFrameSources.get(image);
  if (!canvas || !isWideBookwalkerSpreadCanvas(canvas)) return false;
  try {
    const size = loadedImageSize(image);
    return size.width / Math.max(1, size.height) >= BOOKWALKER_SPREAD_MIN_ASPECT;
  } catch {
    return false;
  }
  }
  async recognizeBookwalkerSpreadFrame(image, settings, recognizer) {
  const slices = await splitImageIntoPageColumns(image);
  const results = await Promise.all(slices.map(async (slice) => {
    const result = await this.recognizeWithDarkPass(slice.image, settings, recognizer).catch(() => null);
    return result ? offsetOcrResult(result, slice.left, 0, slice.totalWidth, slice.totalHeight) : null;
  }));
  return mergeOcrResults(slices[0]?.totalWidth ?? 0, slices[0]?.totalHeight ?? 0, results);
  }
  // Normal recognition always runs. A second, inverted pass is spent only when
  // the image has a dark region (where white-on-black text could hide) AND that
  // region came back unread by the normal pass. Full-page reader canvases are
  // the latency-sensitive path: if the normal pass found text on a manga page,
  // don't double the provider round-trip just to search dark art regions. If a
  // reader page comes back empty, the inverted recovery still gets a chance.
  async recognizeWithDarkPass(image, settings, recognizer) {
  const normal = await this.runRecognizer(image, settings, recognizer, false);
  if (!settings.ocrInvertDarkPanels) return normal;
  const field = buildLuminanceField(image);
  if (!field || luminanceFieldDarkFraction(field) < DARK_REGION_TRIGGER) return normal;
  if ((this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image)) && normal?.lines.length) return normal;
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
  async renderResult(state2, result, forceOverlay = false, work = ocrTargetWork(state2.key)) {
  this.requireCurrentContentState(state2, work.contentKey);
  work.target.requireCurrent(STALE_OCR_STATE);
  if (this.shouldPreserveReaderRasterResult(state2) && state2.overlay.querySelector(".jpdb-ocr-line") && ocrResultTextKey(state2.result) === ocrResultTextKey(result)) {
    this.updateOcrStatus(state2.image, "ready");
    return;
  }
  state2.result = result;
  const settings = this.options.getSettings();
  const showText = this.shouldShowOcrTextOverlay(state2, settings, forceOverlay);
  const initialParsed = await this.parseOcrLines(result.lines);
  this.requireCurrentContentState(state2, work.contentKey);
  work.target.requireCurrent(STALE_OCR_STATE);
  const lines = cleanOcrLookupLines(result.lines, initialParsed);
  if (!lines.length) {
    if (this.shouldPreserveReaderRasterResult(state2)) {
      this.updateOcrStatus(state2.image, "ready");
      return;
    }
    this.renderNoOcrLines(state2);
    this.updateOcrStatus(state2.image, "empty");
    return;
  }
  const parsed = ocrLinesChanged(result.lines, lines) ? await this.parseOcrLines(lines) : initialParsed;
  this.requireCurrentContentState(state2, work.contentKey);
  work.target.requireCurrent(STALE_OCR_STATE);
  const sentence = lines.map((line) => line.text).join("\n");
  const vocabulary = ocrVocabularyCards(state2.image);
  const fallbackCardFromText = ocrFallbackCardFromImage(
    state2.image,
    this.options.fallbackCardFromText ?? ocrFallbackCardFromText
  );
  const renderedTokens = lines.map((line, index) => ocrTokensWithFallbackGaps(
    line.text,
    ocrTokensWithVocabulary(line.text, parsed[index] ?? [], vocabulary),
    fallbackCardFromText
  ));
  const flatTokens = renderedTokens.flat();
  await this.options.enrichTokensBeforeRender?.(flatTokens);
  this.requireCurrentContentState(state2, work.contentKey);
  work.target.requireCurrent(STALE_OCR_STATE);
  applyOcrOverlayStyle(state2.overlay, settings);
  const lineElements = lines.map((line, index) => this.renderOcrLineElement(state2, result, line, renderedTokens[index] ?? [], sentence, showText, settings));
  const staleLines = Array.from(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
  state2.overlay.append(...lineElements);
  this.migrateOcrLineInteractionState(state2, staleLines, lineElements);
  staleLines.forEach((node) => node.remove());
  this.revealVideoFrameOverlay(state2.image);
  this.positionState(state2.image);
  if (this.canvasFrameSources.has(state2.image)) {
    this.canvasReaderSignature = canvasReaderPageSignature();
    this.canvasReaderSamePageSignatureSkips = 0;
  }
  this.updateOcrStatus(state2.image, "ready");
  void Promise.resolve(this.options.enrichRenderedTokens?.(flatTokens, state2.overlay)).catch((error) => {
    if (isStaleOcrState(error)) return;
    log.warn("OCR rendered token enrichment failed", {}, error);
  }).finally(() => this.schedulePosition());
  }
  shouldShowOcrTextOverlay(state2, settings, forceOverlay) {
  if (this.isScannedPdfCanvasFrame(state2.image)) return false;
  if (this.isReaderRasterFrame(state2.image)) return false;
  return false;
  }
  isScannedPdfCanvasFrame(image) {
  const canvas = this.canvasFrameSources.get(image);
  return Boolean(canvas && (canvas.dataset.pdfText === "scanned" || canvas.closest('.pdf-page[data-pdf-text="scanned"]')));
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
  element.addEventListener("pointerenter", () => this.activateOcrLineMarkup(state2, element));
  element.addEventListener("focusin", () => this.activateOcrLineMarkup(state2, element));
  element.addEventListener("pointerdown", (event) => this.activateOcrLineFromPointer(state2, element, event), true);
  element.addEventListener("keydown", (event) => this.toggleOcrLinePinnedFromKeyboard(state2, element, event));
  element.addEventListener("click", (event) => this.toggleOcrLinePinned(state2, element, event));
  return element;
  }
  activateOcrLineFromPointer(state2, element, event) {
  if (event.button !== 0) return;
  if (element.dataset.pinned === "true") {
    this.activateOcrLineMarkup(state2, element);
    return;
  }
  if (shouldPinOcrLineFromPointer(event)) {
    element.focus({ preventScroll: true });
    this.pinLine(state2, element);
  } else {
    this.activateOcrLineMarkup(state2, element);
  }
  this.pointerActivatedOcrLines.set(element, Date.now());
  }
  toggleOcrLinePinnedFromKeyboard(state2, element, event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (element.dataset.pinned === "true") {
    this.unpinLine(element);
  } else {
    this.pinLine(state2, element);
  }
  event.preventDefault();
  event.stopPropagation();
  }
  toggleOcrLinePinned(state2, element, event) {
  if (this.wasRecentlyPointerActivated(element)) {
    this.activateOcrLineMarkup(state2, element);
  } else if (element.dataset.pinned === "true") {
    this.unpinLine(element);
  } else {
    this.activateOcrLineMarkup(state2, element);
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
  state2.overlay.querySelectorAll('.jpdb-ocr-line[data-pinned="true"]').forEach((line) => {
    if (line !== element) this.unpinLine(line);
  });
  this.activateOcrLineMarkup(state2, element);
  element.dataset.pinned = "true";
  element.setAttribute("aria-pressed", "true");
  this.syncOcrLineActiveState(element);
  this.schedulePosition();
  }
  unpinLine(element) {
  element.dataset.pinned = "false";
  element.setAttribute("aria-pressed", "false");
  this.syncOcrLineActiveState(element);
  this.schedulePosition();
  }
  syncOcrLineActiveState(element) {
  const retained = Boolean(this.lookupLineLeases.get(element)?.size);
  element.classList.toggle("jpdb-ocr-line-active", element.dataset.pinned === "true" || retained);
  }
  migrateOcrLineInteractionState(state2, staleLines, replacementLines) {
  const available = new Set(replacementLines);
  const replacements = /* @__PURE__ */ new Map();
  staleLines.forEach((staleLine) => {
    const identity = ocrRenderedLineIdentity(staleLine);
    const replacement = replacementLines.find((candidate) => available.has(candidate) && ocrRenderedLineIdentity(candidate) === identity);
    if (!replacement) return;
    replacements.set(staleLine, replacement);
    available.delete(replacement);
  });
  staleLines.forEach((staleLine, index) => {
    if (replacements.has(staleLine)) return;
    const replacement = replacementLines[index];
    if (!replacement || !available.has(replacement)) return;
    replacements.set(staleLine, replacement);
    available.delete(replacement);
  });
  staleLines.forEach((staleLine) => {
    const replacement = replacements.get(staleLine);
    if (replacement) {
      this.replacementOcrLines.set(staleLine, replacement);
    }
    const leases = this.lookupLineLeases.get(staleLine);
    this.lookupLineLeases.delete(staleLine);
    if (leases && replacement) {
      const replacementLeases = this.lookupLineLeases.get(replacement) ?? /* @__PURE__ */ new Set();
      leases.forEach((lease) => {
        lease.line = replacement;
        replacementLeases.add(lease);
      });
      this.lookupLineLeases.set(replacement, replacementLeases);
    } else {
      leases?.forEach((lease) => {
        lease.line = void 0;
      });
    }
    if (!replacement) return;
    if (staleLine.dataset.pinned === "true") {
      replacement.dataset.pinned = "true";
      replacement.setAttribute("aria-pressed", "true");
    }
    if (leases?.size || replacement.dataset.pinned === "true") {
      this.activateOcrLineMarkup(state2, replacement);
    }
    this.syncOcrLineActiveState(replacement);
  });
  }
  currentOcrLine(line) {
  let current = line;
  let replacement = this.replacementOcrLines.get(current);
  while (replacement && replacement !== current) {
    current = replacement;
    replacement = this.replacementOcrLines.get(current);
  }
  if (current !== line) this.replacementOcrLines.set(line, current);
  return current;
  }
  discardOcrLineInteractionState(lines) {
  for (const line of lines) {
    const leases = this.lookupLineLeases.get(line);
    leases?.forEach((lease) => {
      lease.line = void 0;
    });
    this.lookupLineLeases.delete(line);
    this.syncOcrLineActiveState(line);
  }
  }
  renderNoOcrLines(state2) {
  this.discardOcrLineInteractionState(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
  renderNoOcrLines(state2);
  }
  unpinOcrLinesFromDocumentEvent(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".jpdb-ocr-line, .jpdb-reader-popover, .jpdb-reader-settings, .jpdb-reader-onboarding, .jpdb-reader-fab")) return;
  this.unpinAllLines();
  }
  unpinAllLines() {
  for (const state2 of this.states.values()) {
    state2.overlay.querySelectorAll('.jpdb-ocr-line[data-pinned="true"]').forEach((line) => this.unpinLine(line));
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
  const targetChanged = !state2.target.isCurrent();
  if (key === state2.key && !targetChanged) return;
  const preserveReaderRasterResult = !targetChanged && this.shouldPreserveReaderRasterResult(state2);
  state2.key = key;
  state2.target = captureOcrTargetContext();
  if (!preserveReaderRasterResult) state2.result = void 0;
  state2.loading = false;
  state2.overlayRequested = false;
  state2.manualRequested = false;
  state2.autoSkipped = false;
  if (!preserveReaderRasterResult) {
    this.discardOcrLineInteractionState(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
    state2.overlay.querySelectorAll(".jpdb-ocr-line").forEach((node) => node.remove());
    this.removeImageStatusCard(state2.image);
  }
  }
  shouldPreserveReaderRasterResult(state2) {
  return Boolean(state2.result && this.isReaderRasterFrame(state2.image));
  }
  isReaderRasterFrame(image) {
  return this.canvasFrameSources.has(image) || this.backgroundFrameSources.has(image);
  }
  recordReaderRasterEmptyScan(state2, work, userRequested) {
  if (!this.isReaderRasterFrame(state2.image)) return 0;
  const emptyScanKey = this.readerRasterEmptyScanKey(state2, work);
  const attempts = (this.readerRasterEmptyScans.get(emptyScanKey) ?? 0) + 1;
  this.readerRasterEmptyScans.set(emptyScanKey, attempts);
  if (attempts >= READER_RASTER_MAX_EMPTY_SCAN_ATTEMPTS) return attempts;
  window.setTimeout(() => {
    if (!work.target.isCurrent() || !this.isCurrentContentState(state2, work.contentKey)) return;
    const canvas = this.canvasFrameSources.get(state2.image);
    if (canvas && this.canvasFrameNeedsResnapshot(canvas)) {
      this.releaseCanvasFrameForResnapshot(canvas);
      this.scheduleReaderRasterRefresh(0);
      return;
    }
    state2.autoSkipped = false;
    this.enqueue(state2.image, userRequested);
  }, READER_RASTER_EMPTY_RETRY_MS);
  return attempts;
  }
  readerRasterEmptyScanKey(state2, work) {
  const attemptKey = state2.image.dataset.ocrAttemptKey;
  return attemptKey ? work.target.workKey(attemptKey) : work.workKey;
  }
  scheduleReaderRasterProviderRetry(state2, work, userRequested, error) {
  const attemptCost = isOcrRequestTimeout(error) ? 2 : 1;
  const attempts = (this.readerRasterProviderFailures.get(work.workKey) ?? 0) + attemptCost;
  this.readerRasterProviderFailures.set(work.workKey, attempts);
  if (attempts >= READER_RASTER_MAX_PROVIDER_ATTEMPTS + 1) return false;
  const delay = READER_RASTER_PROVIDER_RETRY_BASE_MS * 2 ** (attempts - 1);
  log.warn("OCR provider failed transiently; retrying reader page", { attempt: attempts, delay }, error);
  const previousTimer = this.readerRasterProviderRetryTimers.get(work.workKey);
  if (previousTimer) window.clearTimeout(previousTimer);
  const timer = window.setTimeout(() => {
    if (this.readerRasterProviderRetryTimers.get(work.workKey) !== timer) return;
    this.readerRasterProviderRetryTimers.delete(work.workKey);
    if (!work.target.isCurrent() || !this.isCurrentContentState(state2, work.contentKey)) return;
    state2.autoSkipped = false;
    this.enqueue(state2.image, userRequested);
  }, delay);
  this.readerRasterProviderRetryTimers.set(work.workKey, timer);
  return true;
  }
  clearReaderRasterProviderRetry(key) {
  this.cancelReaderRasterProviderRetryTimer(key);
  this.readerRasterProviderFailures.delete(key);
  }
  cancelReaderRasterProviderRetryTimer(key) {
  const timer = this.readerRasterProviderRetryTimers.get(key);
  if (timer) window.clearTimeout(timer);
  this.readerRasterProviderRetryTimers.delete(key);
  }
  rememberReaderRasterFailure(key) {
  if (key.startsWith("data:")) return;
  this.readerRasterFailedScans.add(key);
  while (this.readerRasterFailedScans.size > MAX_CACHE_ITEMS) {
    const oldest = this.readerRasterFailedScans.values().next().value;
    if (!oldest) break;
    this.readerRasterFailedScans.delete(oldest);
  }
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
  forget(key) {
  if (!this.cache.delete(key)) return;
  persistOcrCacheSoon(this.cache, Date.now());
  }
  schedulePosition() {
  if (this.destroyed) return;
  if (this.positionFrame) return;
  this.positionFrame = window.requestAnimationFrame(() => {
    this.positionFrame = 0;
    if (this.destroyed) return;
    this.positionVideoFrames();
    this.positionCanvasFrames();
    this.positionBackgroundFrames();
    this.positionAllStates();
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
  snapshotPausedVideo(target, manual = false) {
  if (this.destroyed) return;
  if (!(target instanceof HTMLVideoElement) || this.videoFrames.has(target)) return;
  const settings = this.options.getSettings();
  if (!ocrRuntimeActive(settings) || settings.ocrProvider === "off") return;
  if (!manual) {
    if (!settings.ocrVideoPauseFrames) return;
    if (isFreshMiningPause(target)) return;
    if (isLikelyPausedVideoThumbnail(target)) return;
  }
  const rect = target.getBoundingClientRect();
  if (!manual && rect.width * rect.height < settings.ocrMinImageArea) return;
  if (!isNearViewport(target, 0) || isHiddenByCss(target)) return;
  const dataUrl = (this.options.captureVideoFrame ?? captureVideoFrameDataUrl)(target);
  if (!dataUrl) return;
  const frame = document.createElement("img");
  frame.className = "jpdb-ocr-video-frame";
  frame.classList.add("jpdb-ocr-video-frame-pending");
  frame.dataset.yomuVideoFrame = "true";
  frame.dataset.ocrPending = "true";
  frame.alt = "";
  frame.addEventListener("load", () => {
    if (this.videoFrames.get(target) === frame) this.enqueue(frame, true);
  }, { once: true });
  frame.src = dataUrl;
  appendOcrArtifactToRoot(frame, videoFrameArtifactRoot(target));
  this.videoFrames.set(target, frame);
  this.videoFrameVideos.set(frame, target);
  const status = this.createVideoFrameStatus("loading");
  status.classList.add("jpdb-ocr-video-frame-pending");
  this.videoFrameStatuses.set(target, status);
  positionVideoFrameStatus(status, rect, target);
  const resume = this.createVideoFrameResumeControl(target);
  this.videoFrameControls.set(target, resume);
  this.syncVideoFrameArtifactMount(target, frame);
  positionVideoFrameImage(frame, rect, target);
  positionVideoFrameStatus(status, rect, target);
  positionVideoFrameResumeControl(resume, rect, target);
  this.schedulePosition();
  }
  // Reveal the rest of the overlay once OCR has produced text: the frame image
  // and status dot un-gate (the resume/play control is already visible from the
  // moment the video paused), so the readable text appears with its status.
  revealVideoFrameOverlay(image) {
  if (!this.videoFrameVideos.has(image)) return;
  image.classList.remove("jpdb-ocr-video-frame-pending");
  delete image.dataset.ocrPending;
  this.revealVideoFrameStatusAndResume(image);
  }
  // Reveal the status dot (the resume/play control is already visible from the
  // moment of pause), leaving the captured frame image gated. Used on
  // empty/failed terminal states: the viewer gets feedback without the
  // (text-less) frame covering the player. During loading the status stays
  // gated so the native player is reachable.
  revealVideoFrameStatusAndResume(image) {
  const video = this.videoFrameVideos.get(image);
  if (!video) return;
  this.videoFrameStatuses.get(video)?.classList.remove("jpdb-ocr-video-frame-pending");
  this.videoFrameControls.get(video)?.classList.remove("jpdb-ocr-video-frame-pending");
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
  const label = document.createElement("span");
  label.className = "jpdb-ocr-video-frame-status-label";
  element.append(label);
  this.setVideoFrameStatus(element, status);
  appendOcrArtifactToRoot(element, document.body);
  return element;
  }
  setVideoFrameStatus(element, status) {
  const language = this.options.getSettings().interfaceLanguage;
  const label = uiText(language, videoFrameStatusTextKey(status));
  element.dataset.status = status;
  element.classList.remove(
    "jpdb-ocr-video-frame-status-loading",
    "jpdb-ocr-video-frame-status-ready",
    "jpdb-ocr-video-frame-status-empty",
    "jpdb-ocr-video-frame-status-failed",
    "jpdb-ocr-video-frame-status-fade-out"
  );
  element.classList.add("jpdb-ocr-video-frame-status", `jpdb-ocr-video-frame-status-${status}`);
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
  if (this.videoFrameVideos.has(image)) {
    this.applyVideoFrameStatusTransition(image, status);
    return;
  }
  const canvas = this.canvasFrameSources.get(image);
  if (canvas) this.removeCanvasPendingStatus(canvas);
  this.updateImageStatusCard(image, status);
  }
  // Paused-frame overlays keep the image + status gated while OCR runs (the
  // resume/play control is visible from the moment of pause), so the native
  // player and its comment/like/scrubber controls stay reachable. On 'ready'
  // the image + status un-gate; on empty/failed only the status un-gates (the
  // text-less frame image stays hidden) so the viewer still gets feedback
  // without the frame covering the player. A lookup/mining pause never reaches
  // here — it is skipped at snapshot time via the mining marker.
  applyVideoFrameStatusTransition(image, status) {
  if (status === "ready") this.revealVideoFrameOverlay(image);
  else if (status === "empty" || status === "failed") this.revealVideoFrameStatusAndResume(image);
  this.updateVideoFrameStatusForImage(image, status);
  }
  updateImageStatusCard(image, status) {
  if (this.videoFrameVideos.has(image)) return;
  if (!ocrRuntimeActive(this.options.getSettings())) return;
  const existing = this.imageStatuses.get(image);
  const isCanvasFrame = this.canvasFrameSources.has(image);
  const isReaderRasterFrame = isCanvasFrame || this.backgroundFrameSources.has(image);
  this.clearImageStatusTimer(image);
  if (isReaderRasterFrame && isTerminalOcrStatus(status) && this.hasReadyReaderRasterSibling(image)) {
    this.releaseReaderRasterFrameForImage(image);
    return;
  }
  if (status === "empty" && !isReaderRasterFrame) {
    if (existing) removeOcrArtifact(existing);
    this.imageStatuses.delete(image);
    return;
  }
  const card = existing ?? this.createVideoFrameStatus(status);
  if (existing) this.setVideoFrameStatus(card, status);
  else this.imageStatuses.set(image, card);
  card.classList.toggle("jpdb-ocr-canvas-status", isReaderRasterFrame);
  this.configureReaderRasterStatusRetry(card, isReaderRasterFrame);
  const labelNode = card.querySelector(".jpdb-ocr-video-frame-status-label");
  if (labelNode) labelNode.textContent = isReaderRasterFrame ? this.readerRasterStatusLabel(status) : "";
  if (isReaderRasterFrame) this.updateReaderRasterRetryLabel(card, status);
  this.positionImageStatusCard(image, card);
  if (status === "ready" && isReaderRasterFrame) this.releaseTerminalReaderRasterSiblings(image);
  if (status === "ready" && !isReaderRasterFrame) this.scheduleImageStatusFade(image, card);
  }
  hasReadyReaderRasterSibling(image) {
  const groupKey = this.readerRasterFrameGroupKey(image);
  if (!groupKey) return false;
  for (const [candidate, card] of this.imageStatuses) {
    if (candidate === image || card.dataset.status !== "ready") continue;
    if (this.readerRasterFrameGroupKey(candidate) === groupKey) return true;
  }
  return false;
  }
  releaseTerminalReaderRasterSiblings(image) {
  const groupKey = this.readerRasterFrameGroupKey(image);
  if (!groupKey) return;
  for (const [candidate, card] of [...this.imageStatuses]) {
    if (candidate === image || !isTerminalOcrStatus(card.dataset.status)) continue;
    if (this.readerRasterFrameGroupKey(candidate) === groupKey) this.releaseReaderRasterFrameForImage(candidate);
  }
  }
  readerRasterFrameGroupKey(image) {
  if (!isBookwalkerViewerHost()) return "";
  const canvas = this.canvasFrameSources.get(image);
  if (canvas) return bookwalkerSurfaceGroupKey(canvas);
  const surface = this.backgroundFrameSources.get(image);
  return surface?.id ?? "";
  }
  releaseReaderRasterFrameForImage(image) {
  const canvas = this.canvasFrameSources.get(image);
  if (canvas) {
    this.releaseCanvasFrame(canvas);
    return;
  }
  const background = this.backgroundFrameSources.get(image);
  if (background) {
    this.releaseBackgroundFrame(background);
    return;
  }
  this.removeImageStatusCard(image);
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
  const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
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
  removeOcrArtifact(card);
  this.imageStatuses.delete(image);
  }
  configureReaderRasterStatusRetry(card, enabled) {
  if (!enabled) {
    if (card.dataset.yomuOcrRetry === "true") {
      delete card.dataset.yomuOcrRetry;
      card.removeAttribute("role");
      card.removeAttribute("tabindex");
      card.removeAttribute("title");
    }
    return;
  }
  card.dataset.yomuOcrRetry = "true";
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  if (card.dataset.yomuOcrRetryListener === "true") return;
  card.dataset.yomuOcrRetryListener = "true";
  card.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    this.retryReaderRasterStatusCard(card);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    this.retryReaderRasterStatusCard(card);
  });
  }
  // Empty/failed pills read as a dead end without a visible cue that a click
  // re-runs OCR (title/aria alone were invisible on touch readers like
  // BookWalker), so terminal non-ready statuses carry the retry hint inline.
  readerRasterStatusLabel(status) {
  const language = this.options.getSettings().interfaceLanguage;
  const statusLabel = uiText(language, videoFrameStatusTextKey(status));
  if (status !== "empty" && status !== "failed") return statusLabel;
  return `${statusLabel} · ${uiText(language, "ocrRetryScan")}`;
  }
  updateReaderRasterRetryLabel(card, status) {
  const language = this.options.getSettings().interfaceLanguage;
  const statusLabel = uiText(language, videoFrameStatusTextKey(status));
  const retryLabel = uiText(language, "ocrRetryScan");
  card.setAttribute("aria-label", `${statusLabel}. ${retryLabel}`);
  card.setAttribute("title", retryLabel);
  }
  retryReaderRasterStatusCard(card) {
  const image = [...this.imageStatuses].find(([, candidate]) => candidate === card)?.[0];
  if (!image) return;
  this.retryReaderRasterImage(image);
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
  if (status) removeOcrArtifact(status);
  this.videoFrameStatuses.delete(target);
  const state2 = this.states.get(frame);
  if (state2) this.releaseImageState(frame, state2);
  else this.forgetImageWork(frame);
  this.videoFrameVideos.delete(frame);
  removeOcrArtifact(frame);
  }
  releaseAllVideoFrames() {
  for (const video of [...this.videoFrames.keys()]) this.releaseVideoFrame(video);
  }
  // --- Reader raster frames (canvas readers + CSS background-image readers) ---
  startReaderRasterPollingIfNeeded() {
  if (this.readerRasterPoll) return;
  if (this.isProvenRasterFreePage() || !isReaderRasterPage()) return;
  this.readerRasterPoll = window.setInterval(() => {
    const settings = this.options.getSettings();
    this.refreshCanvasReaderSurfaces(settings);
    this.refreshBackgroundImageReaderSurfaces(settings);
  }, 1200);
  }
  refreshCanvasReaderSurfaces(settings, userRequested = false) {
  if (!ocrRuntimeActive(settings) || settings.ocrProvider === "off") return;
  if (this.isProvenRasterFreePage()) {
    this.releaseAllCanvasFrames();
    return;
  }
  const nativeTextLayerBlocksAutoScan = this.options.shouldAutoScan?.() === false && settings.ocrAutoScanImages && !userRequested;
  const ocrOptInCanvases = nativeTextLayerBlocksAutoScan ? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested) : void 0;
  if (this.handleNativeTextLayerCanvasGate(nativeTextLayerBlocksAutoScan, ocrOptInCanvases)) return;
  if (!isReaderRasterPage() && !this.hasTrackedManualCanvasSurface()) {
    this.releaseAllCanvasFrames();
    return;
  }
  this.startReaderRasterPollingIfNeeded();
  const canvases = ocrOptInCanvases ?? activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
  const signature = this.registerCanvasReaderPageSignature(canvases);
  if (signature === null) return;
  if (!settings.ocrAutoScanImages && !userRequested) {
    this.refreshManualCanvasReaderFrames(canvases, settings);
    return;
  }
  this.reconcileCanvasReaderFrames(canvases, signature, settings, userRequested);
  }
  handleNativeTextLayerCanvasGate(nativeTextLayerBlocksAutoScan, ocrOptInCanvases) {
  if (!nativeTextLayerBlocksAutoScan || ocrOptInCanvases?.length) return false;
  if (!isReaderRasterPage()) {
    this.releaseAllCanvasFrames();
    return true;
  }
  const signature = canvasReaderPageSignature();
  const turned = signature !== this.canvasReaderSignature;
  this.canvasReaderSignature = signature;
  for (const canvas of [...this.canvasFrames.keys()]) {
    if (turned || !this.canvasFrameUserRequested.has(canvas)) this.releaseCanvasFrame(canvas);
  }
  return true;
  }
  registerCanvasReaderPageSignature(canvases) {
  const signature = canvasReaderPageSignature();
  if (signature === this.canvasReaderSignature) {
    this.canvasReaderSamePageSignatureSkips = 0;
    return signature;
  }
  if (canvases.some(canvasReaderHasStableSurface)) {
    this.canvasReaderSamePageSignatureSkips = 0;
    this.canvasReaderSignature = signature;
    return signature;
  }
  if (this.shouldHoldCanvasFramesForSamePageSignature(signature)) {
    if (canvases.some((canvas) => this.canvasFrameNeedsResnapshot(canvas))) {
      this.canvasReaderSamePageSignatureSkips = 0;
      this.canvasReaderSignature = signature;
      return signature;
    }
    this.scheduleReaderRasterRefresh(80);
    return null;
  }
  this.canvasReaderSamePageSignatureSkips = 0;
  this.releaseAllCanvasFrames();
  this.canvasReaderSignature = signature;
  return signature;
  }
  refreshManualCanvasReaderFrames(canvases, settings) {
  for (const canvas of [...this.canvasFrames.keys()]) {
    if (this.reconcileUserRequestedManualCanvasFrame(canvas)) continue;
    if (!canvases.includes(canvas)) this.releaseCanvasFrame(canvas);
    else if (this.canvasFrameNeedsResnapshot(canvas)) this.releaseCanvasFrameForResnapshot(canvas);
  }
  this.retryPendingUserRequestedCaptures(settings);
  }
  reconcileCanvasReaderFrames(canvases, signature, settings, userRequested) {
  for (const canvas of [...this.canvasPendingStatuses.keys()]) {
    if (canvases.includes(canvas)) continue;
    if (isBookwalkerViewerHost()) this.cancelCanvasSnapshot(canvas);
    this.removeCanvasPendingStatus(canvas);
  }
  for (const canvas of canvases) {
    if (this.canvasFrames.has(canvas)) continue;
    this.rebindExistingCanvasFrame(canvas, canvasSurfaceSnapshotKey(canvas), userRequested);
  }
  for (const canvas of [...this.canvasFrames.keys()]) {
    if (canvases.includes(canvas)) continue;
    if (this.reconcileUserRequestedManualCanvasFrame(canvas)) continue;
    if (this.shouldKeepCanvasFrameThroughStablePageSurfaceFlicker(canvas, signature)) continue;
    if (this.canvasFrames.get(canvas)?.complete === false) continue;
    this.releaseCanvasFrame(canvas);
  }
  for (const canvas of canvases) {
    if (!this.canvasFrameNeedsResnapshot(canvas)) continue;
    this.releaseCanvasFrameForResnapshot(canvas);
  }
  for (const canvas of canvases) {
    if (this.canvasFrames.has(canvas)) continue;
    this.snapshotCanvasSurface(canvas, settings, userRequested);
  }
  if (this.canvasFrames.size || this.canvasPendingStatuses.size) this.schedulePosition();
  }
  reconcileUserRequestedManualCanvasFrame(canvas) {
  if (!this.canvasFrameUserRequested.has(canvas) || !isManualCanvasReaderSurface(canvas)) return false;
  if (this.canvasFrameNeedsResnapshot(canvas)) this.releaseCanvasFrameForResnapshot(canvas);
  return true;
  }
  async snapshotCanvasSurface(canvas, settings, userRequested = false) {
  const key = canvasSurfaceSnapshotKey(canvas);
  const startContentToken = canvasStablePageContentToken(canvas);
  if (this.canvasFrames.has(canvas)) {
    if (!userRequested || this.canvasFrameKeys.get(canvas) === key) return;
    this.releaseCanvasFrame(canvas);
  }
  if (!userRequested && (this.canvasCaptureAttempts.get(canvas) ?? 0) > READER_RASTER_MAX_CAPTURE_ATTEMPTS) {
    const liveToken = canvasStablePageContentToken(canvas);
    const failedToken = this.canvasFailureContentTokens.get(canvas);
    if (liveToken && failedToken && liveToken !== failedToken) {
      this.clearCanvasCaptureRetry(canvas);
    } else {
      this.updateCanvasPendingStatus(canvas, canvas.getBoundingClientRect(), "failed");
      return;
    }
  }
  const existingPending = this.pendingCanvasSnapshots.get(canvas);
  const pendingContentChanged = Boolean(existingPending && isRealContentChange(existingPending.contentToken ?? "", startContentToken));
  if (existingPending?.key === key && !pendingContentChanged) {
    if (Date.now() - existingPending.startedAt < READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS) return;
    this.cancelCanvasSnapshot(canvas, existingPending);
    this.handleCanvasCaptureNotReady(canvas, canvas.getBoundingClientRect(), userRequested);
    return;
  }
  if (existingPending) this.cancelCanvasSnapshot(canvas, existingPending);
  const pendingSnapshot = {
    key,
    contentToken: startContentToken || void 0,
    startedAt: Date.now(),
    cancelled: false
  };
  this.pendingCanvasSnapshots.set(canvas, pendingSnapshot);
  const rect = canvas.getBoundingClientRect();
  try {
    if (rect.width * rect.height < settings.ocrMinImageArea) return;
    if (!isNearViewport(canvas, readerRasterCaptureMargin(settings, userRequested)) || isHiddenByCss(canvas)) return;
    this.updateCanvasPendingStatus(canvas, rect, "loading");
    this.armCanvasSnapshotTimeout(canvas, pendingSnapshot, rect, userRequested);
    const captured = await this.captureCanvasSnapshotSource(canvas, settings, rect, userRequested, startContentToken);
    if (captured === null) return;
    if (this.shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested)) return;
    if (!captured) {
      this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
      return;
    }
    const contentKey = captured.contentKey ?? (captured.frameSrc.startsWith("data:") ? `raster:${stableHashBase36(captured.frameSrc)}` : void 0);
    this.commitCanvasSnapshot(canvas, pendingSnapshot, key, rect, { ...captured, contentKey }, userRequested);
  } catch (error) {
    if (!this.wasCanvasSnapshotSuperseded(canvas, pendingSnapshot)) {
      const surface = canvasReaderSurfaceId(canvas) || canvas.dataset.yomuMid || "unidentified";
      log.warnOnce(`canvas-capture:${surface}`, "Reader raster capture failed; retrying", { surface }, error);
      this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
    }
  } finally {
    this.settleCanvasSnapshot(canvas, pendingSnapshot);
  }
  }
  async captureCanvasSnapshotSource(canvas, settings, rect, userRequested, startContentToken) {
  const visibleRect = userRequested ? bookwalkerVisibleCanvasRegion(canvas, rect) : void 0;
  const frameRect = visibleRect ?? rect;
  const regionKey = visibleRect ? canvasRegionContentKey(rect, visibleRect) : "";
  if (isCanvasReadable(canvas)) {
    return this.captureReadableCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, userRequested, startContentToken);
  }
  if (isBookwalkerViewerHost()) {
    return this.captureBookwalkerCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, startContentToken);
  }
  if (!canUseReaderCanvasSourceImageFallback()) return void 0;
  const frameSrc = readerCanvasSourceImageUrl();
  return frameSrc ? { frameSrc, frameRect, contentKey: `src:${frameSrc}`, contentToken: startContentToken } : void 0;
  }
  captureReadableCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, userRequested, contentToken) {
  const contentSignature = canvasRenderedContentSignature(canvas);
  if (!contentSignature) {
    this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
    return null;
  }
  if (!this.canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested)) return null;
  const frameSrc = visibleRect ? captureCanvasRegionDataUrl(canvas, rect, visibleRect, settings.ocrMaxImagePixels) : captureCanvasDataUrl(canvas, settings.ocrMaxImagePixels);
  return frameSrc ? {
    frameSrc,
    frameRect,
    contentKey: bookwalkerCanvasContentKey(contentToken, regionKey) ?? `cv:${contentSignature}:${canvas.width}x${canvas.height}${regionKey}`,
    contentToken
  } : void 0;
  }
  async captureBookwalkerCanvasSnapshot(canvas, settings, rect, frameRect, visibleRect, regionKey, startContentToken) {
  const captureMirror = this.options.captureCanvasMirror ?? captureCanvasMirror;
  const mirror = await captureMirror(canvas, loadCleanMirrorImage);
  if (!mirror) {
    const captureReaderSurface = this.options.captureReaderSurface ?? captureReaderSurfaceViaExtensionScreenshot;
    const screenshot = await captureReaderSurface(canvas, settings.ocrMaxImagePixels);
    return screenshot?.dataUrl ? {
      frameSrc: screenshot.dataUrl,
      frameRect: screenshot.rect ?? rect,
      contentKey: bookwalkerCanvasContentKey(startContentToken, regionKey),
      contentToken: startContentToken
    } : void 0;
  }
  const frameSrc = visibleRect ? captureCanvasRegionDataUrl(mirror, rect, visibleRect, settings.ocrMaxImagePixels) : captureCanvasDataUrl(mirror, settings.ocrMaxImagePixels);
  if (!frameSrc) return void 0;
  const mirrorSignature = canvasRenderedContentSignature(mirror);
  const contentToken = mirror.dataset.yomuMirrorContentToken || startContentToken;
  const contentKey = bookwalkerCanvasContentKey(contentToken, regionKey) ?? (mirrorSignature ? `cv:${mirrorSignature}:${mirror.width}x${mirror.height}${regionKey}` : void 0);
  return { frameSrc, frameRect, contentKey, contentToken };
  }
  commitCanvasSnapshot(canvas, pendingSnapshot, key, canvasRect, captured, userRequested) {
  if (this.destroyed || !canvas.isConnected || this.canvasFrames.has(canvas)) return;
  if (!ocrRuntimeActive(this.options.getSettings())) return;
  if (this.shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested)) return;
  const finishContentToken = canvasStablePageContentToken(canvas);
  if (captured.contentToken && finishContentToken && finishContentToken !== captured.contentToken) {
    this.handleCanvasCommitMismatch(canvas, canvasRect, userRequested, "content identity");
    return;
  }
  if (canvasSurfaceSnapshotKey(canvas) !== key) {
    this.handleCanvasCommitMismatch(canvas, canvasRect, userRequested, "surface identity");
    return;
  }
  const frame = document.createElement("img");
  frame.className = "jpdb-ocr-canvas-frame";
  frame.dataset.yomuCanvasFrame = "true";
  if (captured.contentKey) frame.dataset.ocrContentKey = canvasFrameContentKey(captured.contentKey, canvas);
  frame.alt = "";
  positionCanvasFrameImage(frame, captured.frameRect);
  const finishFrameLoad = (loaded) => {
    if (this.canvasFrames.get(canvas) !== frame) return;
    const timer = this.canvasFrameLoadTimers.get(frame);
    if (timer) window.clearTimeout(timer);
    this.canvasFrameLoadTimers.delete(frame);
    if (loaded) {
      this.removeCanvasPendingStatus(canvas);
      this.clearCanvasCaptureRetry(canvas);
      this.canvasCommitMismatches.delete(canvas);
      this.enqueue(frame, userRequested);
      return;
    }
    this.discardUnloadedCanvasFrame(canvas, frame);
    this.handleCanvasCaptureNotReady(canvas, canvasRect, userRequested);
  };
  frame.addEventListener("load", () => finishFrameLoad(true), { once: true });
  frame.addEventListener("error", () => finishFrameLoad(false), { once: true });
  document.body.append(frame);
  this.canvasFrames.set(canvas, frame);
  this.canvasFrameSources.set(frame, canvas);
  this.canvasFrameKeys.set(canvas, key);
  const committedContentToken = captured.contentToken || finishContentToken;
  if (committedContentToken) this.canvasFrameContentTokens.set(canvas, committedContentToken);
  else this.canvasFrameContentTokens.delete(canvas);
  frame.dataset.ocrAttemptKey = canvasFrameOcrAttemptKey(canvas, key, committedContentToken);
  this.rememberCanvasSnapshotRegion(frame, canvasRect, captured.frameRect);
  if (userRequested) this.canvasFrameUserRequested.add(canvas);
  else this.canvasFrameUserRequested.delete(canvas);
  this.canvasFrameLoadTimers.set(frame, window.setTimeout(
    () => finishFrameLoad(false),
    READER_RASTER_FRAME_LOAD_TIMEOUT_MS
  ));
  frame.src = captured.frameSrc;
  this.canvasReaderSignature = canvasReaderPageSignature();
  this.canvasReaderSamePageSignatureSkips = 0;
  this.schedulePosition();
  }
  handleCanvasCommitMismatch(canvas, rect, userRequested, reason) {
  const mismatches = (this.canvasCommitMismatches.get(canvas) ?? 0) + 1;
  this.canvasCommitMismatches.set(canvas, mismatches);
  if (mismatches < READER_RASTER_MAX_COMMIT_MISMATCHES) {
    if (userRequested) this.scheduleCanvasCaptureRetry(canvas, true);
    else this.scheduleReaderRasterRefresh(READER_RASTER_RETRY_BASE_MS * mismatches);
    return;
  }
  this.canvasCommitMismatches.delete(canvas);
  this.canvasCaptureAttempts.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS + 1);
  this.canvasTapRecapture.delete(canvas);
  this.canvasFailureContentTokens.set(canvas, canvasStablePageContentToken(canvas));
  const surface = canvasReaderSurfaceId(canvas) || canvas.dataset.yomuMid || "unidentified";
  log.warnOnce(
    `canvas-commit-mismatch:${surface}:${reason}`,
    `Reader raster capture repeatedly changed ${reason}; automatic retries paused`,
    { surface, userRequested }
  );
  this.updateCanvasPendingStatus(canvas, rect, "failed");
  }
  rememberCanvasSnapshotRegion(frame, canvasRect, frameRect) {
  if (frameRect === canvasRect) return;
  this.canvasFrameStaticRects.set(frame, frameRect);
  this.canvasFrameRegionFractions.set(frame, new DOMRect(
    (frameRect.left - canvasRect.left) / canvasRect.width,
    (frameRect.top - canvasRect.top) / canvasRect.height,
    frameRect.width / canvasRect.width,
    frameRect.height / canvasRect.height
  ));
  }
  wasCanvasSnapshotSuperseded(canvas, pendingSnapshot) {
  const current = this.pendingCanvasSnapshots.get(canvas);
  return pendingSnapshot.cancelled || Boolean(current && current !== pendingSnapshot);
  }
  armCanvasSnapshotTimeout(canvas, pending, rect, userRequested) {
  pending.timeoutId = window.setTimeout(() => {
    if (this.pendingCanvasSnapshots.get(canvas) !== pending || pending.cancelled) return;
    this.cancelCanvasSnapshot(canvas, pending);
    this.handleCanvasCaptureNotReady(canvas, rect, userRequested);
  }, READER_RASTER_PENDING_CAPTURE_TIMEOUT_MS);
  }
  settleCanvasSnapshot(canvas, pending) {
  if (pending.timeoutId) window.clearTimeout(pending.timeoutId);
  pending.timeoutId = void 0;
  if (this.pendingCanvasSnapshots.get(canvas) === pending) this.pendingCanvasSnapshots.delete(canvas);
  }
  cancelCanvasSnapshot(canvas, pending = this.pendingCanvasSnapshots.get(canvas)) {
  if (!pending) return;
  pending.cancelled = true;
  if (pending.timeoutId) window.clearTimeout(pending.timeoutId);
  pending.timeoutId = void 0;
  if (this.pendingCanvasSnapshots.get(canvas) === pending) this.pendingCanvasSnapshots.delete(canvas);
  }
  discardUnloadedCanvasFrame(canvas, frame) {
  if (this.canvasFrames.get(canvas) !== frame) return;
  const timer = this.canvasFrameLoadTimers.get(frame);
  if (timer) window.clearTimeout(timer);
  this.canvasFrameLoadTimers.delete(frame);
  this.canvasFrames.delete(canvas);
  this.canvasFrameSources.delete(frame);
  this.canvasFrameStaticRects.delete(frame);
  this.canvasFrameRegionFractions.delete(frame);
  this.canvasFrameKeys.delete(canvas);
  this.canvasFrameContentTokens.delete(canvas);
  this.canvasFrameUserRequested.delete(canvas);
  this.removeImageStatusCard(frame);
  frame.remove();
  }
  shouldDiscardCanvasSnapshot(canvas, pendingSnapshot, userRequested) {
  if (!this.wasCanvasSnapshotSuperseded(canvas, pendingSnapshot)) return false;
  if (userRequested && canvas.isConnected && !this.canvasFrames.has(canvas)) {
    this.scheduleCanvasCaptureRetry(canvas, true);
  }
  return true;
  }
  shouldHoldCanvasFramesForSamePageSignature(signature) {
  if (!this.canvasReaderSignature) return false;
  if (!this.canvasFrames.size) return false;
  if (hasDifferentRecordedCanvasReaderContent(this.canvasReaderSignature, signature)) return false;
  if (shouldTrustStableBookwalkerPageCounter() && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
  if (!isSameCanvasReaderPageLocation(this.canvasReaderSignature, signature)) return false;
  if (hasSameRealCanvasReaderContent(this.canvasReaderSignature, signature)) return true;
  if (hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
  if (isCanvasMirrorEpochTransition(this.canvasReaderSignature, signature)) return false;
  this.canvasReaderSamePageSignatureSkips += 1;
  if (this.canvasReaderSamePageSignatureSkips <= READER_RASTER_SAME_PAGE_SIGNATURE_HOLD_LIMIT) return true;
  this.canvasReaderSamePageSignatureSkips = 0;
  return false;
  }
  shouldKeepCanvasFrameThroughStablePageSurfaceFlicker(canvas, signature) {
  if (!canvas.isConnected) return false;
  if (!this.canvasReaderSignature) return false;
  if (shouldTrustStableBookwalkerPageCounter() && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature)) return true;
  return isSameCanvasReaderPageLocation(this.canvasReaderSignature, signature) && hasSameStableCanvasReaderPageCounter(this.canvasReaderSignature, signature);
  }
  rebindExistingCanvasFrame(canvas, key, userRequested) {
  const existing = this.findCanvasFrameBySnapshotKey(key, canvas);
  if (!existing) return false;
  const { canvas: previousCanvas, frame } = existing;
  if (this.canvasFrameStaticRects.has(frame)) return false;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  this.removeCanvasPendingStatus(previousCanvas);
  this.removeCanvasPendingStatus(canvas);
  this.cancelCanvasSnapshot(previousCanvas);
  this.cancelCanvasSnapshot(canvas);
  this.canvasFrames.delete(previousCanvas);
  this.canvasFrames.set(canvas, frame);
  this.canvasFrameSources.set(frame, canvas);
  this.canvasFrameKeys.delete(previousCanvas);
  this.canvasFrameKeys.set(canvas, key);
  const contentToken = this.canvasFrameContentTokens.get(previousCanvas) || canvasStablePageContentToken(canvas);
  this.canvasFrameContentTokens.delete(previousCanvas);
  if (contentToken) this.canvasFrameContentTokens.set(canvas, contentToken);
  else this.canvasFrameContentTokens.delete(canvas);
  this.canvasContentReadiness.delete(canvasContentReadinessKey(previousCanvas));
  this.canvasContentReadiness.set(canvasContentReadinessKey(canvas), canvasPageContentToken(canvas));
  this.canvasCaptureAttempts.delete(previousCanvas);
  this.canvasTapRecapture.delete(previousCanvas);
  if (this.canvasFrameUserRequested.has(previousCanvas) || userRequested) this.canvasFrameUserRequested.add(canvas);
  else this.canvasFrameUserRequested.delete(canvas);
  this.canvasFrameUserRequested.delete(previousCanvas);
  positionCanvasFrameImage(frame, rect);
  this.schedulePosition();
  return true;
  }
  findCanvasFrameBySnapshotKey(key, excludeCanvas) {
  for (const [canvas, frame] of this.canvasFrames) {
    if (canvas === excludeCanvas) continue;
    if (this.canvasFrameKeys.get(canvas) !== key) continue;
    if (frame.complete === false) continue;
    if (this.canvasContentTokenChanged(excludeCanvas, this.canvasFrameContentTokens.get(canvas))) continue;
    return { canvas, frame };
  }
  return void 0;
  }
  canvasContentIsReadyToSnapshot(canvas, contentSignature, userRequested) {
  const readinessKey = canvasContentReadinessKey(canvas);
  if (userRequested) {
    this.canvasContentReadiness.set(readinessKey, contentSignature);
    return true;
  }
  const previous = this.canvasContentReadiness.get(readinessKey);
  this.canvasContentReadiness.set(readinessKey, contentSignature);
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
  // A canvas capture failed (engine hasn't painted / mirror has no ops yet).
  // Retry with exponential backoff so the page OCRs as soon as it's ready instead
  // of waiting for the next 1200ms poll. After the cap automatic retries pause on
  // a tappable status. A real turn (releaseAllCanvasFrames), success, or explicit
  // tap resets the counter and reopens capture.
  // A user-requested (tapped) capture opens a bounded recapture WINDOW so the retry
  // re-attempts AS a tap — in tap/manual mode the poll itself never captures, so
  // without this a failed tap is dropped and the page never OCRs until the user taps
  // again. The window survives page-signature changes (a late repaint, or the poll
  // first seeing the freshly-composited page, that releaseAllCanvasFrames treats as a
  // turn) and is bounded by its own attempt count, so it can never become permanent
  // auto-OCR — it expires after READER_RASTER_MAX_CAPTURE_ATTEMPTS tries.
  handleCanvasCaptureNotReady(canvas, rect, userRequested) {
  if (this.deferAutomaticCaptureForBookwalkerRecorder(canvas, rect, userRequested)) return;
  if (this.scheduleCanvasCaptureRetry(canvas, userRequested)) return;
  this.canvasFailureContentTokens.set(canvas, canvasStablePageContentToken(canvas));
  this.updateCanvasPendingStatus(canvas, rect, "failed");
  }
  deferAutomaticCaptureForBookwalkerRecorder(canvas, rect, userRequested) {
  if (userRequested || !isBookwalkerViewerHost()) return false;
  if (isCanvasReadable(canvas) && canvasRenderedContentSignature(canvas)) return false;
  if (canvasMirrorContentToken(canvas)) {
    if (this.canvasMirrorWaitStartedAt.delete(canvas)) this.canvasCaptureAttempts.delete(canvas);
    return false;
  }
  const startedAt = this.canvasMirrorWaitStartedAt.get(canvas) ?? Date.now();
  this.canvasMirrorWaitStartedAt.set(canvas, startedAt);
  if (Date.now() - startedAt >= BOOKWALKER_RECORDER_BOOT_GRACE_MS) return false;
  this.canvasCaptureAttempts.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
  this.updateCanvasPendingStatus(canvas, rect, "loading");
  return true;
  }
  scheduleCanvasCaptureRetry(canvas, userRequested = false) {
  if (userRequested) {
    if (!this.canvasTapRecapture.has(canvas)) this.canvasTapRecapture.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
    const remaining = this.canvasTapRecapture.get(canvas) ?? 0;
    if (remaining <= 0) {
      this.canvasTapRecapture.delete(canvas);
      return false;
    }
    const attempt2 = READER_RASTER_MAX_CAPTURE_ATTEMPTS - remaining;
    const delay2 = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** attempt2, READER_RASTER_RETRY_MAX_MS);
    this.scheduleReaderRasterRefresh(delay2);
    return true;
  }
  const attempts = (this.canvasCaptureAttempts.get(canvas) ?? 0) + 1;
  this.canvasCaptureAttempts.set(canvas, attempts);
  if (attempts > READER_RASTER_MAX_CAPTURE_ATTEMPTS) return false;
  const delay = Math.min(READER_RASTER_RETRY_BASE_MS * 2 ** (attempts - 1), READER_RASTER_RETRY_MAX_MS);
  this.scheduleReaderRasterRefresh(delay);
  return true;
  }
  // Re-attempt captures a tap requested but that weren't ready yet. Called before the
  // tap-mode poll early-return so a tapped-but-not-ready page keeps trying without the
  // user tapping again (the "page has no OCR" / no-pill report). Each pass decrements
  // the canvas's remaining window so it bounds out even if snapshot can't schedule.
  retryPendingUserRequestedCaptures(settings) {
  if (!this.canvasTapRecapture.size) return;
  for (const [canvas, remaining] of [...this.canvasTapRecapture]) {
    if (!canvas.isConnected || this.canvasFrames.has(canvas) || remaining <= 0) {
      this.canvasTapRecapture.delete(canvas);
      continue;
    }
    this.canvasTapRecapture.set(canvas, remaining - 1);
    void this.snapshotCanvasSurface(canvas, settings, true);
  }
  }
  clearCanvasCaptureRetry(canvas) {
  this.canvasCaptureAttempts.delete(canvas);
  this.canvasMirrorWaitStartedAt.delete(canvas);
  this.canvasCommitMismatches.delete(canvas);
  this.canvasFailureContentTokens.delete(canvas);
  this.canvasTapRecapture.delete(canvas);
  }
  updateCanvasPendingStatus(canvas, rect, status) {
  const existing = this.canvasPendingStatuses.get(canvas);
  const card = existing ?? this.createVideoFrameStatus(status);
  if (existing) this.setVideoFrameStatus(card, status);
  else this.canvasPendingStatuses.set(canvas, card);
  card.classList.add("jpdb-ocr-canvas-status");
  this.configureCanvasPendingStatusRetry(card);
  this.updateReaderRasterRetryLabel(card, status);
  const labelNode = card.querySelector(".jpdb-ocr-video-frame-status-label");
  if (labelNode) labelNode.textContent = uiText(this.options.getSettings().interfaceLanguage, videoFrameStatusTextKey(status));
  card.hidden = false;
  this.canvasPendingStatusKeys.set(canvas, canvasSurfaceSnapshotKey(canvas));
  positionOcrImageStatus(card, this.visibleViewportIntersection(rect) ?? rect);
  }
  removeCanvasPendingStatus(canvas) {
  const card = this.canvasPendingStatuses.get(canvas);
  if (!card) return;
  removeOcrArtifact(card);
  this.canvasPendingStatuses.delete(canvas);
  this.canvasPendingStatusKeys.delete(canvas);
  }
  isTerminalCanvasPendingStatus(card) {
  const status = card.dataset.status;
  return status === "empty" || status === "failed";
  }
  configureCanvasPendingStatusRetry(card) {
  card.dataset.yomuOcrRetry = "true";
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  if (card.dataset.yomuOcrRetryListener === "true") return;
  card.dataset.yomuOcrRetryListener = "true";
  card.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    this.retryCanvasPendingStatusCard(card);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    this.retryCanvasPendingStatusCard(card);
  });
  }
  retryCanvasPendingStatusCard(card) {
  const canvas = [...this.canvasPendingStatuses].find(([, candidate]) => candidate === card)?.[0];
  if (!canvas) return;
  this.cancelCanvasSnapshot(canvas);
  this.removeCanvasPendingStatus(canvas);
  this.clearCanvasCaptureRetry(canvas);
  void this.snapshotCanvasSurface(canvas, this.options.getSettings(), true);
  }
  releaseCanvasFrame(canvas) {
  const frame = this.canvasFrames.get(canvas);
  this.cancelCanvasSnapshot(canvas);
  this.removeCanvasPendingStatus(canvas);
  if (!frame) return;
  const loadTimer = this.canvasFrameLoadTimers.get(frame);
  if (loadTimer) window.clearTimeout(loadTimer);
  this.canvasFrameLoadTimers.delete(frame);
  this.canvasFrames.delete(canvas);
  const state2 = this.states.get(frame);
  if (state2) this.releaseImageState(frame, state2);
  else this.forgetImageWork(frame);
  this.canvasFrameSources.delete(frame);
  this.canvasFrameStaticRects.delete(frame);
  this.canvasFrameRegionFractions.delete(frame);
  this.canvasFrameKeys.delete(canvas);
  this.canvasFrameContentTokens.delete(canvas);
  this.canvasContentReadiness.delete(canvasContentReadinessKey(canvas));
  this.canvasCaptureAttempts.delete(canvas);
  this.canvasMirrorWaitStartedAt.delete(canvas);
  this.canvasCommitMismatches.delete(canvas);
  this.canvasFailureContentTokens.delete(canvas);
  this.canvasTapRecapture.delete(canvas);
  this.canvasFrameUserRequested.delete(canvas);
  frame.remove();
  }
  releaseAllCanvasFrames() {
  for (const canvas of [...this.canvasFrames.keys()]) this.releaseCanvasFrame(canvas);
  for (const canvas of [...this.canvasPendingStatuses.keys()]) {
    this.cancelCanvasSnapshot(canvas);
    this.removeCanvasPendingStatus(canvas);
  }
  this.canvasContentReadiness.clear();
  this.canvasCaptureAttempts.clear();
  this.canvasMirrorWaitStartedAt.clear();
  this.canvasCommitMismatches.clear();
  this.canvasFailureContentTokens.clear();
  this.canvasReaderSignature = void 0;
  this.canvasReaderSamePageSignatureSkips = 0;
  }
  positionCanvasFrames() {
  for (const [canvas, status] of [...this.canvasPendingStatuses]) {
    if (!canvas.isConnected) {
      this.cancelCanvasSnapshot(canvas);
      this.removeCanvasPendingStatus(canvas);
      continue;
    }
    const key = this.canvasPendingStatusKeys.get(canvas);
    if (key && canvasSurfaceSnapshotKey(canvas) !== key) {
      this.cancelCanvasSnapshot(canvas);
      this.removeCanvasPendingStatus(canvas);
      continue;
    }
    const rect = this.visibleViewportIntersection(canvas.getBoundingClientRect());
    if (!rect) {
      if (this.isTerminalCanvasPendingStatus(status)) this.removeCanvasPendingStatus(canvas);
      else status.hidden = true;
      continue;
    }
    status.hidden = false;
    positionOcrImageStatus(status, rect);
  }
  for (const [canvas, frame] of [...this.canvasFrames]) {
    if (!canvas.isConnected) {
      this.releaseCanvasFrame(canvas);
      continue;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || isHiddenByCss(canvas) || isInsideHiddenAncestor(canvas, false)) {
      this.releaseCanvasFrame(canvas);
      continue;
    }
    const key = this.canvasFrameKeys.get(canvas);
    if (key && key !== canvasSurfaceSnapshotKey(canvas)) {
      this.releaseCanvasFrame(canvas);
      this.scheduleReaderRasterRefresh(40);
      continue;
    }
    const staticRect = this.canvasFrameStaticRects.get(frame);
    if (staticRect) {
      const currentRegionRect = this.canvasFrameRegionRect(frame, rect);
      if (this.canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, rect)) {
        if (this.shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame)) {
          this.releaseCanvasFrameForResnapshot(canvas);
          this.scheduleReaderRasterRefresh(40);
          continue;
        }
      }
      positionCanvasFrameImage(frame, currentRegionRect ?? staticRect);
      continue;
    }
    positionCanvasFrameImage(frame, rect);
  }
  }
  releaseCanvasFrameForResnapshot(canvas) {
  const preserveUserRequested = this.canvasFrameUserRequested.has(canvas);
  this.releaseCanvasFrame(canvas);
  if (preserveUserRequested) this.canvasTapRecapture.set(canvas, READER_RASTER_MAX_CAPTURE_ATTEMPTS);
  }
  canvasFrameNeedsResnapshot(canvas) {
  const frame = this.canvasFrames.get(canvas);
  if (!frame || frame.complete === false) return false;
  const key = this.canvasFrameKeys.get(canvas);
  if (key && key !== canvasSurfaceSnapshotKey(canvas)) return true;
  if (this.canvasContentTokenChanged(canvas, this.canvasFrameContentTokens.get(canvas))) return true;
  const staticRect = this.canvasFrameStaticRects.get(frame);
  if (staticRect) {
    const canvasRect = canvas.getBoundingClientRect();
    const currentRegionRect = this.canvasFrameRegionRect(frame, canvasRect);
    return Boolean(this.canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, canvasRect) && this.shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame));
  }
  return false;
  }
  shouldRecaptureCroppedReaderRasterFrameForGeometryChange(frame) {
  if (!this.isReaderRasterFrame(frame)) return false;
  const status = this.imageStatuses.get(frame)?.dataset.status;
  return status === "ready" || Boolean(this.states.get(frame)?.result?.lines.length);
  }
  canvasFrameRectSizeChanged(captured, current) {
  return Math.abs(captured.width - current.width) > READER_RASTER_FRAME_SIZE_CHANGE_PX || Math.abs(captured.height - current.height) > READER_RASTER_FRAME_SIZE_CHANGE_PX;
  }
  canvasStaticFrameGeometryChanged(frame, staticRect, currentRegionRect, canvasRect) {
  return Boolean(currentRegionRect && (this.canvasFrameRectSizeChanged(staticRect, currentRegionRect) || this.canvasFrameSourceSizeChanged(frame, staticRect, canvasRect)));
  }
  canvasFrameSourceSizeChanged(frame, staticRect, canvasRect) {
  const fractions = this.canvasFrameRegionFractions.get(frame);
  if (!fractions?.width || !fractions.height) return false;
  const sourceWidth = staticRect.width / fractions.width;
  const sourceHeight = staticRect.height / fractions.height;
  return Math.abs(sourceWidth - canvasRect.width) > READER_RASTER_FRAME_SIZE_CHANGE_PX || Math.abs(sourceHeight - canvasRect.height) > READER_RASTER_FRAME_SIZE_CHANGE_PX;
  }
  canvasContentTokenChanged(canvas, previous) {
  return hasIdentityChanged(canvas, previous);
  }
  canvasFrameRegionRect(frame, canvasRect) {
  const fractions = this.canvasFrameRegionFractions.get(frame);
  if (!fractions || !canvasRect.width || !canvasRect.height) return void 0;
  return new DOMRect(
    canvasRect.left + fractions.x * canvasRect.width,
    canvasRect.top + fractions.y * canvasRect.height,
    fractions.width * canvasRect.width,
    fractions.height * canvasRect.height
  );
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
  if (!ocrRuntimeActive(settings) || settings.ocrProvider === "off") return;
  if (!settings.ocrAutoScanImages && !userRequested) return;
  if (isBookwalkerViewerHost()) {
    this.releaseAllBackgroundFrames();
    return;
  }
  if (this.options.shouldAutoScan?.() === false && !userRequested) {
    this.releaseAllBackgroundFrames();
    return;
  }
  if (this.isProvenRasterFreePage() || !isReaderRasterPage()) {
    this.releaseAllBackgroundFrames();
    return;
  }
  this.startReaderRasterPollingIfNeeded();
  const canvasSurfaces = activeReaderRasterSurfaces(collectCanvasReaderSurfaces(), settings, userRequested);
  const surfaces = activeReaderRasterSurfaces(collectBackgroundImageReaderSurfaces(), settings, userRequested).filter((surface) => !canvasSurfaces.some((canvas) => readerRasterSurfacesOverlap(canvas, surface)));
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
  retryVisibleReaderRasterFrames(settings) {
  let retried = 0;
  for (const image of [...this.states.keys()]) {
    if (!this.isReaderRasterFrame(image)) continue;
    const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
    if (!isImageVisibleForOcr(image, rect) || !isNearViewport(image, readerRasterCaptureMargin(settings, true))) continue;
    this.retryReaderRasterImage(image);
    retried++;
  }
  return retried;
  }
  retryReaderRasterImage(image) {
  const target = captureOcrTargetContext();
  const work = ocrTargetWork(imageCacheKey(image), target);
  const state2 = this.states.get(image);
  const attemptKey = image.dataset.ocrAttemptKey;
  const emptyScanKey = state2 ? this.readerRasterEmptyScanKey(state2, work) : attemptKey && target.workKey(attemptKey);
  if (state2) this.forget(state2.target.cacheKey(state2.key));
  this.forget(work.cacheKey);
  this.readerRasterEmptyScans.delete(work.workKey);
  if (state2) this.readerRasterEmptyScans.delete(state2.target.workKey(state2.key));
  if (emptyScanKey) this.readerRasterEmptyScans.delete(emptyScanKey);
  this.readerRasterFailedScans.delete(work.workKey);
  if (state2) this.readerRasterFailedScans.delete(state2.target.workKey(state2.key));
  this.clearReaderRasterProviderRetry(work.workKey);
  if (state2) this.clearReaderRasterProviderRetry(state2.target.workKey(state2.key));
  this.queue = this.queue.filter((queued) => queued !== image);
  const settings = this.options.getSettings();
  const canvas = this.canvasFrameSources.get(image);
  if (canvas) {
    this.releaseCanvasFrame(canvas);
    void this.snapshotCanvasSurface(canvas, settings, true);
    return;
  }
  const background = this.backgroundFrameSources.get(image);
  if (background) {
    this.releaseBackgroundFrame(background);
    this.snapshotBackgroundImageSurface(background, settings, true);
  }
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
    this.syncVideoFrameArtifactMount(video, frame);
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
  this.positionStates([image], true);
  }
  positionAllStates() {
  this.positionStates(this.states.keys());
  }
  positionStates(images, forceLayout = false) {
  const plans = [];
  const fontScale = this.options.getSettings().ocrFontScale;
  for (const image of images) {
    const state2 = this.states.get(image);
    if (!state2) continue;
    const overlay = state2.overlay;
    const rect = this.readerRasterSourceRect(image) ?? image.getBoundingClientRect();
    if (!isImageVisibleForOcr(image, rect)) {
      plans.push([overlay]);
      continue;
    }
    const surface = this.ocrLayerTransformSurface(image);
    const linear = surface ? composedOcrSurfaceTransform(surface, overlay.parentElement) : null;
    const placement = ocrOverlayLayerPlacement(
      rect,
      linear,
      { width: surface?.offsetWidth ?? 0, height: surface?.offsetHeight ?? 0 }
    );
    plans.push([
      overlay,
      placement,
      this.renderedOcrImageFrameForState(
        image,
        ocrPlacedSurfaceRect(rect, placement),
        state2.result,
        rect.bottom
      ),
      ocrArtifactRootOffset(overlay),
      ocrOverlayTypeface(overlay)
    ]);
  }
  for (const [overlay, placement, frame, offset, typeface] of plans) {
    const visible = Boolean(placement && frame);
    overlay.hidden = !visible;
    setOcrOverlayAccessibility(overlay, visible);
    if (!placement || !frame) continue;
    setOcrArtifactPosition(overlay, placement.left, placement.top, offset);
    overlay.style.width = `${placement.width}px`;
    overlay.style.height = `${placement.height}px`;
    setOcrLayerTransform(overlay, placement.transform);
    layoutOcrOverlayIfChanged(
      overlay,
      frame,
      fontScale,
      placement.linear,
      typeface,
      forceLayout
    );
  }
  }
  // Follow the element painting the pixels; regional canvas captures stay axis-aligned.
  ocrLayerTransformSurface(image) {
  const canvas = this.canvasFrameSources.get(image);
  if (canvas) {
    return this.canvasFrameRegionFractions.has(image) || this.canvasFrameStaticRects.has(image) ? null : canvas;
  }
  return this.backgroundFrameSources.get(image) ?? image;
  }
  readerRasterSourceRect(image) {
  const canvas = this.canvasFrameSources.get(image);
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    return this.canvasFrameRegionRect(image, rect) ?? this.canvasFrameStaticRects.get(image) ?? rect;
  }
  const surface = this.backgroundFrameSources.get(image);
  return surface?.getBoundingClientRect();
  }
  // Reserve only true viewport-bottom reader chrome, never in-page player chrome.
  renderedOcrImageFrameForState(image, rect, result, viewportBottom = rect.bottom) {
  const frame = this.canvasFrameSources.has(image) ? renderedCanvasReaderFrame(rect) : renderedOcrImageFrame(image, rect, result);
  if (!this.canvasFrameSources.has(image) && !this.backgroundFrameSources.has(image)) return frame;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!viewportHeight || viewportBottom < viewportHeight - 2) return frame;
  const reserved = Math.max(0, Math.min(READER_RASTER_BOTTOM_CHROME_RESERVE_PX, frame.imageHeight - 1));
  return reserved ? { ...frame, safeBottomInset: reserved } : frame;
  }
  clear() {
  this.observer?.disconnect();
  this.observer = void 0;
  this.observerMargin = "";
  window.clearTimeout(this.refreshTimer);
  this.releaseAllCanvasFrames();
  this.releaseAllBackgroundFrames();
  this.queue = [];
  this.inFlightJobs.clear();
  for (const timer of this.readerRasterProviderRetryTimers.values()) window.clearTimeout(timer);
  this.readerRasterProviderRetryTimers.clear();
  this.readerRasterProviderFailures.clear();
  for (const state2 of this.states.values()) {
    if (state2.loadListener) state2.image.removeEventListener("load", state2.loadListener);
    removeOcrArtifact(state2.overlay);
  }
  this.states.clear();
  this.discardOcrLineInteractionState([...this.lookupLineLeases.keys()]);
  for (const timer of this.imageStatusTimers.values()) window.clearTimeout(timer);
  this.imageStatusTimers.clear();
  for (const card of this.imageStatuses.values()) removeOcrArtifact(card);
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
  releaseInlineImageStates() {
  for (const [image, state2] of [...this.states]) {
    if (this.isReaderRasterFrame(image) || this.videoFrameVideos.has(image)) continue;
    this.releaseImageState(image, state2);
  }
  }
  syncPageScannerIsolation(settings) {
  const enabled = isPopupLookupEnabled(settings);
  if (this.pageScannerIsolationEnabled === enabled) return;
  this.pageScannerIsolationEnabled = enabled;
  for (const state2 of this.states.values()) {
    state2.overlay.querySelectorAll(".jpdb-ocr-line-text").forEach((lineText) => normalizeOcrRenderedText(lineText, enabled));
  }
  }
  rememberOcrWordRenderStates(line, tokens) {
  this.ocrWordRenderStates.rememberLine(line, tokens);
  }
  reconcileRenderedWordVocabulary(word, card, pitchClass) {
  this.ocrWordRenderStates.reconcile(word, card, pitchClass);
  }
  activateOcrLineMarkup(state2, line) {
  if (this.activateOcrMarkup(line)) this.positionState(state2.image);
  }
  activateOcrMarkup(line) {
  const previousHasFurigana = line.dataset.hasFuri;
  const wasActivated = line.dataset.ocrMarkupActivated === "true";
  let hasFurigana = false;
  const settings = this.options.getSettings();
  const isolatePageScanners = isPopupLookupEnabled(settings);
  line.querySelectorAll(".jpdb-reader-word[data-vid][data-sid]").forEach((word) => {
    const state2 = this.ocrWordRenderStates.get(word);
    if (!state2) return;
    this.applyOcrPitchClass(word, state2.token);
    if (!shouldRenderRuby(state2.surface, state2.token, settings)) {
      this.setOcrWordPlainText(word, state2.surface, isolatePageScanners);
      return;
    }
    setInnerHtml(word, renderRuby(state2.surface, state2.token));
    normalizeOcrRenderedText(word, isolatePageScanners);
    word.classList.add("jpdb-reader-has-furi");
    hasFurigana = true;
  });
  line.dataset.hasFuri = String(hasFurigana);
  line.dataset.ocrMarkupActivated = "true";
  return !wasActivated || previousHasFurigana !== line.dataset.hasFuri;
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
  setOcrWordPlainText(word, surface, isolatePageScanners) {
  word.classList.remove("jpdb-reader-has-furi");
  setInnerHtml(word, escapeHtml(surface));
  normalizeOcrRenderedText(word, isolatePageScanners);
  }
  // Drop every paused-frame and image overlay when YouTube navigates so no
  // stale OCR artifact (rail resume button, overlay over the player) carries
  // across the SPA route change, then re-scan the destination page.
  teardownForNavigation() {
  if (this.states.size === 0 && this.videoFrames.size === 0 && this.canvasFrames.size === 0 && this.backgroundFrames.size === 0) return;
  this.releaseAllVideoFrames();
  this.clear();
  if (ocrRuntimeActive(this.options.getSettings())) this.scheduleRefresh(0);
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
    if (state2.loadListener) image.removeEventListener("load", state2.loadListener);
    this.discardOcrLineInteractionState(state2.overlay.querySelectorAll(".jpdb-ocr-line"));
    removeOcrArtifact(state2.overlay);
    this.states.delete(image);
  }
  this.forgetImageWork(image, state2);
  }
  syncVideoFrameArtifactMount(video, frame) {
  const root = videoFrameArtifactRoot(video);
  appendOcrArtifactToRoot(frame, root);
  const state2 = this.states.get(frame);
  if (state2) appendOcrArtifactToRoot(state2.overlay, root);
  const status = this.videoFrameStatuses.get(video);
  if (status) appendOcrArtifactToRoot(status, root);
  const resume = this.videoFrameControls.get(video);
  if (resume?.classList.contains("jpdb-ocr-video-frame-resume-fallback")) appendOcrArtifactToRoot(resume, root);
  }
  forgetImageWork(image, state2) {
  this.queue = this.queue.filter((queued) => queued !== image);
  this.cancelReaderRasterProviderRetryTimer(ocrTargetWorkKey(imageCacheKey(image)));
  if (state2) this.cancelReaderRasterProviderRetryTimer(state2.target.workKey(state2.key));
  this.removeImageStatusCard(image);
  }
  isCurrentState(state2) {
  return !this.destroyed && this.states.get(state2.image) === state2;
  }
  isCurrentContentState(state2, key) {
  return this.isCurrentState(state2) && state2.key === key && imageCacheKey(state2.image) === key;
  }
  requireCurrentContentState(state2, key) {
  if (!this.isCurrentContentState(state2, key)) throw STALE_OCR_STATE;
  }
}
function isStaleOcrState(error) {
  return error === STALE_OCR_STATE;
}
function applyOcrOverlayStyle(overlay, settings) {
  const theme = effectiveOcrOverlayTheme(settings);
  overlay.dataset.ocrOverlayTheme = theme;
  overlay.dataset.ocrOverlayVariant = settings.ocrOverlayTheme === "auto" ? "auto" : "custom";
  if (theme === "light") {
  overlay.style.setProperty("--jpdb-ocr-text-color", "#17202a");
  overlay.style.setProperty("--jpdb-ocr-outline-color", "rgba(255, 255, 255, 0)");
  overlay.style.setProperty("--jpdb-ocr-background-rgba", "rgba(248, 250, 252, 0.68)");
  overlay.style.setProperty("--jpdb-ocr-background-active-rgba", "rgba(248, 250, 252, 0.86)");
  return;
  }
  overlay.style.setProperty("--jpdb-ocr-text-color", settings.ocrTextColor);
  overlay.style.setProperty("--jpdb-ocr-outline-color", settings.ocrOutlineColor);
  const opacity = accessibleOcrBackgroundOpacity(settings.ocrBackgroundOpacity);
  const background = accessibleOcrBackgroundColor(settings.accentColor, opacity);
  overlay.style.setProperty("--jpdb-ocr-background-rgba", accentToRgba(background, opacity));
  overlay.style.setProperty("--jpdb-ocr-background-active-rgba", accentToRgba(background, Math.min(1, opacity + 0.12)));
}
function effectiveOcrOverlayTheme(settings) {
  if (settings.ocrOverlayTheme === "dark" || settings.ocrOverlayTheme === "light") return settings.ocrOverlayTheme;
  if (settings.theme === "dark" || settings.theme === "light") return settings.theme;
  try {
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
  return "dark";
  }
}
function ocrParseOptions() {
  return {
  allowSegmentedFallback: true,
  includeLocalPitch: true
  };
}
function ocrTokensWithFallbackGaps(text, tokens, fallbackCardFromText) {
  const safeTokens = tokens.filter((token) => isRenderableOcrToken(token, text.length));
  const fallbackTokens = segmentTargetLanguageText(text).filter((segment) => !safeTokens.some((token) => rangesOverlap(segment.start, segment.end, token.start, token.end))).map((segment) => ocrFallbackToken(text, segment, fallbackCardFromText));
  return fallbackTokens.length ? [...safeTokens, ...fallbackTokens].sort(compareOcrTokens) : safeTokens;
}
function ocrTokensWithVocabulary(text, tokens, vocabulary) {
  if (!vocabulary?.size) return tokens;
  return tokens.map((token) => ocrTokenWithVocabulary(text, token, vocabulary));
}
function ocrTokenWithVocabulary(text, token, vocabulary) {
  const surface = ocrTokenSurface(text, token);
  const seeded = vocabulary.get(ocrVocabularyKey(surface)) ?? vocabulary.get(ocrVocabularyKey(token.card.spelling));
  if (!seeded) return token;
  const card = cloneOcrVocabularyCard(seeded);
  return {
  ...token,
  card,
  pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling) || token.pitchClass
  };
}
function ocrTokenSurface(text, token) {
  return text.slice(token.start, token.end) || token.card.spelling;
}
function isRenderableOcrToken(token, textLength) {
  return Number.isFinite(token.start) && Number.isFinite(token.end) && token.start >= 0 && token.end <= textLength && token.end > token.start;
}
function ocrFallbackToken(sentence, segment, fallbackCardFromText) {
  const card = fallbackCardFromText(segment.text);
  return {
  card,
  start: segment.start,
  end: segment.end,
  length: segment.end - segment.start,
  rubies: [],
  pitchClass: getPitchClass(card.pitchAccent, card.reading || card.spelling),
  sentence
  };
}
function ocrFallbackCardFromImage(image, fallbackCardFromText) {
  const vocabulary = ocrVocabularyCards(image);
  if (!vocabulary?.size) return fallbackCardFromText;
  return (text) => {
  const seeded = vocabulary.get(ocrVocabularyKey(text));
  return seeded ? cloneOcrVocabularyCard(seeded) : fallbackCardFromText(text);
  };
}
function ocrVocabularyCards(image) {
  const cached = ocrVocabularyCache.get(image);
  if (cached !== void 0) return cached;
  const parsed = parseOcrVocabularyCards(image.dataset.ocrVocabulary);
  ocrVocabularyCache.set(image, parsed);
  return parsed;
}
function parseOcrVocabularyCards(value) {
  if (!value) return null;
  try {
  const entries2 = JSON.parse(value);
  if (!Array.isArray(entries2)) return null;
  const cards = /* @__PURE__ */ new Map();
  entries2.forEach((entry) => {
    if (!isOcrVocabularyRecord(entry)) return;
    const card = ocrVocabularyCard(entry);
    const surface = ocrVocabularySurface(entry) || card?.spelling;
    if (card && surface) cards.set(ocrVocabularyKey(surface), card);
  });
  return cards.size ? cards : null;
  } catch {
  return null;
  }
}
function ocrVocabularyCard(entry) {
  if (!isOcrVocabularyRecord(entry)) return null;
  const surface = ocrVocabularySurface(entry);
  const spelling = ocrVocabularyString(entry.spelling) || surface;
  if (!surface || !spelling) return null;
  const reading = ocrVocabularyString(entry.reading);
  const id = -stablePositiveHashId(`ocr-vocabulary
${spelling}
${reading}`);
  return {
  vid: id,
  sid: id,
  rid: 0,
  spelling,
  reading,
  frequencyRank: ocrVocabularyInteger(entry.frequencyRank) ?? null,
  partOfSpeech: [],
  meanings: [],
  cardState: ["not-in-deck"],
  pitchAccent: ocrVocabularyPitchPatterns(entry, reading),
  wordWithReading: null,
  source: "fallback"
  };
}
function cloneOcrVocabularyCard(card) {
  return {
  ...card,
  partOfSpeech: [...card.partOfSpeech],
  meanings: card.meanings.map((meaning) => ({
    ...meaning,
    glosses: [...meaning.glosses],
    partOfSpeech: [...meaning.partOfSpeech]
  })),
  cardState: [...card.cardState],
  pitchAccent: [...card.pitchAccent]
  };
}
function ocrVocabularySurface(entry) {
  return ocrVocabularyString(entry.surface) || ocrVocabularyString(entry.text);
}
function ocrVocabularyPitchPatterns(entry, reading) {
  const explicit = Array.isArray(entry.pitchAccent) ? entry.pitchAccent.filter((value) => typeof value === "string" && /^[HL]+$/u.test(value)) : [];
  const positions = ocrVocabularyPitchPositions(entry);
  return [
  ...explicit,
  ...positions.map((position) => pitchPatternFromPosition(reading, position)).filter(Boolean)
  ];
}
function ocrVocabularyPitchPositions(entry) {
  if (Array.isArray(entry.pitchPositions)) {
  return entry.pitchPositions.map(ocrVocabularyInteger).filter((position2) => position2 !== void 0);
  }
  const position = ocrVocabularyInteger(entry.pitchPosition);
  return position === void 0 ? [] : [position];
}
function ocrVocabularyKey(value) {
  return value.replace(/\s+/g, " ").trim();
}
function ocrVocabularyString(value) {
  return typeof value === "string" ? value.trim() : "";
}
function ocrVocabularyInteger(value) {
  return Number.isInteger(value) ? value : void 0;
}
function isOcrVocabularyRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function rangesOverlap(start, end, otherStart, otherEnd) {
  return start < otherEnd && otherStart < end;
}
function compareOcrTokens(first, second) {
  return first.start - second.start || second.length - first.length;
}
function createOcrLineElement(result, line, tokens, sentence, showText, settings) {
  const element = document.createElement("div");
  element.className = showText ? "jpdb-ocr-line jpdb-ocr-line-visible" : "jpdb-ocr-line";
  setOcrLineDataset(element, result, line, sentence);
  element.tabIndex = 0;
  element.style.writingMode = line.vertical ? "vertical-rl" : "horizontal-tb";
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", line.text);
  element.setAttribute("aria-pressed", "false");
  const textElement = createOcrLineText(line, tokens, settings);
  element.append(textElement);
  element.dataset.hasFuri = String(Boolean(textElement.querySelector(".jpdb-reader-has-furi")));
  setOcrLinePosition(element, result, line);
  return element;
}
function ocrRenderedLineIdentity(element) {
  return JSON.stringify([
  element.dataset.ocrText ?? "",
  element.dataset.boxLeft ?? "",
  element.dataset.boxTop ?? "",
  element.dataset.boxWidth ?? "",
  element.dataset.boxHeight ?? "",
  element.dataset.vertical ?? ""
  ]);
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
  normalizeOcrRenderedText(textElement, isPopupLookupEnabled(settings));
  return textElement;
}
function ocrSafePitchClass(pitchClass) {
  const normalized = pitchClass?.trim() ?? "";
  return /^(?:heiban|atamadaka|nakadaka|odaka)$/u.test(normalized) ? normalized : "";
}
function setOcrLinePosition(element, result, line) {
  element.style.left = `${100 * line.box.left / result.width}%`;
  element.style.top = `${100 * line.box.top / result.height}%`;
  element.style.width = `${100 * line.box.width / result.width}%`;
  element.style.height = `${100 * line.box.height / result.height}%`;
}
function renderedOcrImageFrame(image, rect, result) {
  const pausedVideoFrame = renderedPausedVideoFrame(image, rect);
  if (pausedVideoFrame) return pausedVideoFrame;
  const style = getComputedStyle(image);
  const content = imageContentBox(image, rect, style);
  const { sourceWidth, sourceHeight } = ocrSourceDimensions(image, rect, content, result);
  return paintedImageFrame({
  image,
  rect,
  style,
  objectFit: style.objectFit,
  objectPosition: style.objectPosition,
  sourceWidth,
  sourceHeight
  });
}
function renderedPausedVideoFrame(image, rect) {
  if (image.dataset.yomuVideoFrame !== "true") return null;
  return {
  imageLeft: 0,
  imageTop: 0,
  imageWidth: Math.max(1, rect.width),
  imageHeight: Math.max(1, rect.height)
  };
}
function renderedCanvasReaderFrame(rect) {
  return {
  imageLeft: 0,
  imageTop: 0,
  imageWidth: Math.max(1, rect.width),
  imageHeight: Math.max(1, rect.height)
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
  if (!ocrRuntimeActive(settings) || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
  const image = pointerEventImageTarget(event) ?? pointerEventImageAtPoint(event);
  return image && isCandidateImage(image, settings) && shouldObserveImage(image, settings) ? image : null;
}
function ocrReaderSurfaceFromPointerEvent(event, settings, rasterFreePage) {
  if (rasterFreePage || !ocrRuntimeActive(settings) || settings.ocrProvider === "off" || !isPointerLikeEvent(event) || !shouldHandleOcrPointerEvent(event)) return null;
  if (pointerEventOverOcrOverlay(event)) return null;
  return pointerEventReaderSurfaceTarget(event, settings) ?? pointerEventReaderSurfaceAtPoint(event, settings);
}
function touchPointFromEvent(event) {
  const touchEvent = event;
  const touch = touchEvent.changedTouches?.[0] ?? touchEvent.touches?.[0];
  if (!touch || typeof touch.clientX !== "number" || typeof touch.clientY !== "number") return null;
  return { clientX: touch.clientX, clientY: touch.clientY };
}
function eventWithPoint(event, point) {
  return {
  type: "pointerdown",
  target: event.target,
  button: 0,
  clientX: point.clientX,
  clientY: point.clientY,
  pointerType: "touch"
  };
}
function pointerEventOverOcrOverlay(event) {
  const target = event.target;
  if (target?.closest?.("[data-jpdb-reader-root]")) return true;
  return Boolean(ocrPointerHitElement(event)?.closest?.("[data-jpdb-reader-root]"));
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
  const element = ocrPointerHitElement(event);
  if (!element || element.closest("[data-jpdb-reader-root]")) return null;
  return element instanceof HTMLImageElement ? element : element.closest("img");
}
function pointerEventReaderSurfaceTarget(event, settings) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || target.closest("[data-jpdb-reader-root]")) return null;
  return readerSurfaceFromElement(target, settings);
}
function pointerEventReaderSurfaceAtPoint(event, settings) {
  const element = ocrPointerHitElement(event);
  if (element && !element.closest("[data-jpdb-reader-root]")) {
  const surface = readerSurfaceFromElement(element, settings);
  if (surface) return surface;
  }
  return readerSurfaceAtPoint(event.clientX, event.clientY, settings);
}
function readerSurfaceFromElement(element, settings) {
  const canvas = element instanceof HTMLCanvasElement ? element : element.closest("canvas");
  if (canvas && isManualCanvasReaderSurface(canvas) && isReaderSurfaceCandidate(canvas, settings)) return canvas;
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
  return Boolean(image.closest("[data-jpdb-reader-root]") || image.closest('[data-yomu-ocr="ignore"], [data-jpdb-reader-ocr="ignore"]') || image.closest('[aria-hidden="true"], [hidden], .slick-cloned') || isBookwalkerReaderSourceImage(image) || isBrandOrIconOcrImage(image) || isYouTubeThumbnailImage(image));
}
function isBookwalkerReaderSourceImage(image) {
  return isBookwalkerViewerHost() && image.classList.contains("loadingImage");
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
function isInsideHiddenAncestor(element, includeAriaHidden = true) {
  for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
  if (isHiddenByCss(current) || current.hasAttribute("hidden") || includeAriaHidden && current.getAttribute("aria-hidden") === "true") return true;
  }
  return false;
}
function isHiddenByCss(element) {
  const style = getComputedStyle(element);
  return style.visibility === "hidden" || style.display === "none" || Number(style.opacity || "1") <= 0;
}
function canAutoRefreshOcrAfterMutation(settings, shouldAutoScan) {
  return settings.ocrAutoScanImages && (shouldAutoScan?.() !== false || hasCanvasOcrOptInSurface());
}
function hasCanvasOcrOptInSurface() {
  return Boolean(document.querySelector('canvas[data-yomu-canvas-ocr="on"], [data-yomu-canvas-ocr="on"] canvas'));
}
function isCanvasOcrOptInSurface(canvas) {
  return canvas.dataset.yomuCanvasOcr === "on" || Boolean(canvas.closest('[data-yomu-canvas-ocr="on"]'));
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
  const active = surfaces.filter((surface) => isNearViewport(surface, margin)).sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a) || elementViewportDistance(a) - elementViewportDistance(b));
  if (!userRequested && isBookwalkerViewerHost()) return activeBookwalkerReaderRasterSurfaces(active, settings);
  const limit = readerRasterMaxSurfaces(settings, userRequested);
  return active.slice(0, limit);
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
function visibleElementViewportArea(element) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!viewportWidth || !viewportHeight) return 0;
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.right);
  const bottom = Math.min(viewportHeight, rect.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}
function readerRasterSurfacesOverlap(first, second) {
  const a = first.getBoundingClientRect();
  const b = second.getBoundingClientRect();
  const intersection = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const smallerArea = Math.min(a.width * a.height, b.width * b.height);
  return smallerArea > 0 && intersection / smallerArea >= 0.72;
}
function bookwalkerVisibleCanvasRegion(canvas, rect) {
  if (!isBookwalkerViewerHost()) return void 0;
  const clip = elementVisibleViewportClip(canvas);
  if (!clip || !rect.width || !rect.height) return void 0;
  const left = Math.max(clip.left, rect.left);
  const top = Math.max(clip.top, rect.top);
  const right = Math.min(clip.right, rect.right);
  const bottom = Math.min(clip.bottom, rect.bottom);
  const width = right - left;
  const height = bottom - top;
  if (width < READER_RASTER_REGION_MIN_SIZE_PX || height < READER_RASTER_REGION_MIN_SIZE_PX) return void 0;
  const area = width * height;
  const fullArea = rect.width * rect.height;
  if (area >= fullArea * READER_RASTER_REGION_FULL_PAGE_FRACTION) return void 0;
  return new DOMRect(left, top, width, height);
}
function elementVisibleViewportClip(element) {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (!viewportWidth || !viewportHeight) return void 0;
  let left = 0;
  let top = 0;
  let right = viewportWidth;
  let bottom = viewportHeight;
  for (let ancestor = element.parentElement; ancestor && ancestor !== document.documentElement; ancestor = ancestor.parentElement) {
  const style = getComputedStyle(ancestor);
  const clipsX = cssOverflowClips(style.overflowX) || cssOverflowClips(style.overflow);
  const clipsY = cssOverflowClips(style.overflowY) || cssOverflowClips(style.overflow);
  if (!clipsX && !clipsY) continue;
  const rect = ancestor.getBoundingClientRect();
  if (!rect.width || !rect.height) continue;
  if (clipsX) {
    left = Math.max(left, rect.left);
    right = Math.min(right, rect.right);
  }
  if (clipsY) {
    top = Math.max(top, rect.top);
    bottom = Math.min(bottom, rect.bottom);
  }
  }
  const width = right - left;
  const height = bottom - top;
  return width > 0 && height > 0 ? new DOMRect(left, top, width, height) : void 0;
}
function cssOverflowClips(value) {
  return value === "hidden" || value === "clip" || value === "auto" || value === "scroll";
}
function canvasRegionContentKey(surfaceRect, regionRect) {
  const parts = [
  regionRect.left - surfaceRect.left,
  regionRect.top - surfaceRect.top,
  regionRect.width,
  regionRect.height
  ].map((value) => Math.round(value));
  return `:region:${parts.join(",")}`;
}
function activeBookwalkerReaderRasterSurfaces(surfaces, settings) {
  const visible = surfaces.filter((surface) => visibleElementViewportArea(surface) > 1);
  if (visible.length <= 1) return visible;
  const spread = visibleBookwalkerSpreadSurfaces(visible);
  if (spread.length) return spread.slice(0, Math.min(2, readerRasterMaxSurfaces(settings, false)));
  const dominant = dominantBookwalkerSurfaceGroup(visible);
  return dominant.slice(0, 1);
}
function dominantBookwalkerSurfaceGroup(surfaces) {
  const groups = /* @__PURE__ */ new Map();
  for (const surface of surfaces) {
  const key = bookwalkerSurfaceGroupKey(surface);
  if (!key) continue;
  const group = groups.get(key);
  if (group) group.push(surface);
  else groups.set(key, [surface]);
  }
  let best;
  let bestArea = 0;
  for (const group of groups.values()) {
  const area = group.reduce((sum, surface) => sum + visibleElementViewportArea(surface), 0);
  if (area <= bestArea) continue;
  best = group;
  bestArea = area;
  }
  if (best?.length) {
  return best.slice().sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a) || elementViewportDistance(a) - elementViewportDistance(b));
  }
  return surfaces.slice(0, 1);
}
function bookwalkerSurfaceGroupKey(surface) {
  if (surface instanceof HTMLCanvasElement && canvasReaderHasStableSurface(surface)) return canvasReaderSurfaceId(surface);
  const element = surface instanceof HTMLElement ? surface : surface.parentElement;
  return element?.closest('.canvasRoot.verticalAxis[id], [id^="wideScreen"][id]')?.id ?? "";
}
function visibleBookwalkerSpreadSurfaces(surfaces) {
  if (surfaces.length < 2) return [];
  const spread = surfaces.slice().sort((a, b) => visibleElementViewportArea(b) - visibleElementViewportArea(a)).slice(0, 2);
  const [firstSurface, secondSurface] = spread;
  if (!firstSurface || !secondSurface) return [];
  const firstKey = bookwalkerSurfaceGroupKey(firstSurface);
  const secondKey = bookwalkerSurfaceGroupKey(secondSurface);
  if (firstKey && secondKey && firstKey === secondKey) return [];
  const [first, second] = spread.map((surface) => surface.getBoundingClientRect());
  if (!first || !second) return [];
  const smallerHeight = Math.max(1, Math.min(first.height, second.height));
  const verticalOverlap2 = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  if (verticalOverlap2 / smallerHeight < 0.55) return [];
  const centerYGap = Math.abs(first.top + first.height / 2 - (second.top + second.height / 2));
  if (centerYGap > Math.max(first.height, second.height) * 0.2) return [];
  return first.right <= second.left || second.right <= first.left ? spread : [];
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
  setOcrArtifactPosition(frame, content.left, content.top);
  frame.style.width = `${content.width}px`;
  frame.style.height = `${content.height}px`;
}
function positionVideoFrameResumeControl(control, rect, video) {
  const root = videoFrameArtifactRoot(video);
  if (attachVideoFrameResumeControlToSubtitleRail(control, root)) return;
  attachVideoFrameResumeControlFallback(control, root);
  const content = videoContentBox(rect, video);
  setOcrArtifactPosition(control, content.left + content.width - 12, content.top + 12);
}
function positionVideoFrameStatus(status, rect, video) {
  const content = videoContentBox(rect, video);
  const maxWidth = Math.max(96, Math.min(Math.max(96, content.width - 24), 320));
  setOcrArtifactPosition(status, Math.max(8, content.left + 12), Math.max(8, content.top + 12));
  status.style.maxWidth = `${maxWidth}px`;
}
function positionOcrImageStatus(status, rect) {
  const maxWidth = Math.max(96, Math.min(Math.max(96, rect.width - 24), 320));
  setOcrArtifactPosition(status, Math.max(8, rect.left + 12), Math.max(8, rect.top + 12));
  status.style.maxWidth = `${maxWidth}px`;
}
function appendOcrArtifactToRoot(element, root) {
  const oldRoot = element.parentElement;
  const fullscreenHosted = root !== document.body;
  if (fullscreenHosted) prepareOcrFullscreenHost(root);
  element.dataset.yomuOcrFullscreenHosted = fullscreenHosted ? "true" : "false";
  if (oldRoot !== root) root.append(element);
  clearOcrFullscreenHostMarker(oldRoot);
}
function removeOcrArtifact(element) {
  const oldRoot = element.parentElement;
  element.remove();
  clearOcrFullscreenHostMarker(oldRoot);
}
function clearOcrFullscreenHostMarker(root) {
  if (!(root instanceof HTMLElement) || root === document.body) return;
  if (root.querySelector('[data-yomu-ocr-fullscreen-hosted="true"]')) return;
  delete root.dataset.yomuOcrFullscreenHost;
  if (root.dataset.yomuOcrFullscreenHostPosition === "relative") {
  root.style.position = "";
  delete root.dataset.yomuOcrFullscreenHostPosition;
  }
}
function prepareOcrFullscreenHost(root) {
  root.dataset.yomuOcrFullscreenHost = "true";
  const position = getComputedStyle(root).position;
  if (position && position !== "static") return;
  root.style.position = "relative";
  root.dataset.yomuOcrFullscreenHostPosition = "relative";
}
function videoFrameArtifactRoot(video) {
  return activeVideoFullscreenHost(video) ?? document.body;
}
function activeVideoFullscreenHost(video) {
  const active = activeFullscreenElement();
  if (active && (active === document.body || active === document.documentElement)) return document.body;
  if (active instanceof HTMLVideoElement && active === video) return fullscreenVideoArtifactHost(video);
  if (active && active.contains(video)) return active;
  const host = video.closest(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR);
  if (host && host.isConnected && host !== video && host.contains(video)) return host;
  return youtubeFullscreenHostForOcrVideo(video);
}
function fullscreenVideoArtifactHost(video) {
  const host = video.closest(VIDEO_FRAME_FULLSCREEN_HOST_SELECTOR) ?? video.closest(VIDEO_FRAME_PLAYER_SELECTOR);
  if (host && host !== video && host.isConnected && host.contains(video)) return host;
  return youtubeFullscreenHostForOcrVideo(video);
}
function youtubeFullscreenHostForOcrVideo(video) {
  if (!isYouTubePageForOcr()) return null;
  const scopedHost = [
  video.closest('[data-yomu-inline-fullscreen="true"]'),
  video.closest(".html5-video-player.ytp-fullscreen"),
  video.closest("#movie_player.ytp-fullscreen"),
  video.closest("ytd-watch-flexy[fullscreen] #movie_player"),
  video.closest("ytd-watch-flexy[fullscreen] ytd-player"),
  video.closest("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen")
  ].find((element) => Boolean(element && element !== video));
  if (scopedHost) return scopedHost;
  return [
  document.querySelector('[data-yomu-inline-fullscreen="true"]'),
  document.querySelector(".html5-video-player.ytp-fullscreen"),
  document.querySelector("#movie_player.ytp-fullscreen"),
  document.querySelector("ytd-watch-flexy[fullscreen] #movie_player"),
  document.querySelector("ytd-watch-flexy[fullscreen] ytd-player"),
  document.querySelector("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen")
  ].find((element) => Boolean(element && element !== video && (element.contains(video) || isYouTubeMobileFullscreenHostForOcr(element)))) ?? null;
}
function isYouTubePageForOcr() {
  return isYouTubeAppHostname();
}
function isYouTubeMobileFullscreenHostForOcr(element) {
  return /^m\.youtube\.com$/i.test(location.hostname) && element.matches("ytm-player[fullscreen], ytm-player.fullscreen, ytm-player.ytp-fullscreen");
}
function activeFullscreenElement() {
  const doc = document;
  const element = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? doc.mozFullScreenElement ?? doc.msFullscreenElement ?? null;
  return element instanceof HTMLElement ? element : null;
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
function attachVideoFrameResumeControlToSubtitleRail(control, root) {
  const rail = subtitleRailForOcrRoot(root);
  if (!rail?.isConnected) return false;
  const oldParent = control.parentElement;
  const oldRoot = subtitlePlayerRoot(control);
  control.classList.remove("jpdb-ocr-video-frame-resume-fallback");
  control.dataset.yomuOcrFullscreenHosted = "false";
  control.style.left = "";
  control.style.top = "";
  const panelButton = rail.querySelector(".jpdb-subtitle-panel-toggle");
  if (control.parentElement !== rail) rail.insertBefore(control, panelButton ?? null);
  clearOcrFullscreenHostMarker(oldParent);
  updateSubtitleRailResumeState(oldRoot);
  updateSubtitleRailResumeState(subtitlePlayerRoot(control));
  return true;
}
function attachVideoFrameResumeControlFallback(control, root) {
  const oldRoot = subtitlePlayerRoot(control);
  appendOcrArtifactToRoot(control, root);
  control.classList.add("jpdb-ocr-video-frame-resume-fallback");
  updateSubtitleRailResumeState(oldRoot);
}
function removeVideoFrameResumeControl(control) {
  const root = subtitlePlayerRoot(control);
  removeOcrArtifact(control);
  updateSubtitleRailResumeState(root);
}
function subtitleRailForOcrRoot(root) {
  const rails = Array.from(document.querySelectorAll('.jpdb-subtitle-player[data-jpdb-reader-root="true"] .jpdb-subtitle-rail'));
  if (root === document.body) return rails.find((rail) => rail.isConnected) ?? null;
  return rails.find((rail) => rail.isConnected && root.contains(rail)) ?? null;
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
  const style = getComputedStyle(video);
  const object = fittedObjectSize(videoObjectFit(style.objectFit), intrinsicWidth, intrinsicHeight, rect.width, rect.height);
  const offset = objectPositionOffset(style.objectPosition || "50% 50%", rect.width - object.width, rect.height - object.height);
  return {
  left: rect.left + offset.x,
  top: rect.top + offset.y,
  width: object.width,
  height: object.height
  };
}
function videoObjectFit(value) {
  switch (value) {
  case "contain":
  case "cover":
  case "none":
  case "scale-down":
    return value;
  case "fill":
  default:
    return "contain";
  }
}
function ocrResultTextKey(result) {
  return result?.lines.map((line) => line.text).join("\n") ?? "";
}
function readerRasterSurfaceSnapshotKey(surface) {
  return surface instanceof HTMLCanvasElement ? canvasSurfaceSnapshotKey(surface) : backgroundSurfaceCacheKey(surface);
}
function canvasFrameContentKey(contentKey, canvas) {
  return isWideBookwalkerSpreadCanvas(canvas) ? `${contentKey}:bw-spread-v2` : contentKey;
}
function bookwalkerCanvasContentKey(contentToken, regionKey) {
  if (!isBookwalkerViewerHost() || !contentToken) return void 0;
  return `bw:${contentToken}${regionKey}`;
}
function canvasFrameOcrAttemptKey(canvas, snapshotKey, contentToken) {
  return `canvas:${snapshotKey}|${contentToken || canvasStablePageContentToken(canvas)}`;
}
function isWideBookwalkerSpreadCanvas(canvas) {
  return isBookwalkerViewerHost() && !isBookwalkerContinuousScrollCanvas(canvas) && canvas.width / Math.max(1, canvas.height) >= BOOKWALKER_SPREAD_MIN_ASPECT;
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
const cleanMirrorImageCache = /* @__PURE__ */ new Map();
async function loadCleanMirrorImage(url) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return void 0;
  const cacheKey = canonicalBookwalkerAssetUrl(url);
  const cached = cleanMirrorImageCache.get(cacheKey);
  if (cached) return cached;
  const pending = fetchCleanMirrorImage(url).then((image) => {
  if (!image) {
    cleanMirrorImageCache.delete(cacheKey);
    return void 0;
  }
  cleanMirrorImageCache.set(cacheKey, image);
  trimCleanMirrorImageCache();
  return image;
  }).catch((error) => {
  cleanMirrorImageCache.delete(cacheKey);
  throw error;
  });
  cleanMirrorImageCache.set(cacheKey, pending);
  return pending;
}
async function fetchCleanMirrorImage(url) {
  const resource = mirrorImageResourceLabel(url);
  let blob;
  try {
  const resolvedUrl = await bookwalkerAssetResolver.resolve(url);
  try {
    blob = await requestBlob(resolvedUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
  } catch (error) {
    if (!isBookwalkerAuthorizationFailure(error)) throw error;
    const refreshedUrl = await bookwalkerAssetResolver.refresh(url);
    if (!refreshedUrl || refreshedUrl === resolvedUrl) throw error;
    blob = await requestBlob(refreshedUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
  }
  } catch (error) {
  log.warnOnce(`mirror-image-fetch:${resource}`, "BookWalker mirror image fetch failed", { resource }, error);
  throw error;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
  return await loadImage(objectUrl, MIRROR_IMAGE_FETCH_TIMEOUT_MS);
  } catch (error) {
  log.warnOnce(
    `mirror-image-decode:${resource}`,
    "BookWalker mirror image decode failed",
    { bytes: blob.size, resource, type: blob.type },
    error
  );
  throw error;
  } finally {
  URL.revokeObjectURL(objectUrl);
  }
}
function isBookwalkerAuthorizationFailure(error) {
  return error instanceof Error && /Image fetch returned (401|403)\./.test(error.message);
}
function mirrorImageResourceLabel(url) {
  try {
  const parsed = new URL(url, location.href);
  return `${parsed.origin}${parsed.pathname}`;
  } catch {
  return url.split(/[?#]/, 1)[0] ?? "";
  }
}
function trimCleanMirrorImageCache() {
  while (cleanMirrorImageCache.size > MAX_CLEAN_MIRROR_IMAGE_CACHE_ITEMS) {
  const oldest = cleanMirrorImageCache.keys().next().value;
  if (!oldest) return;
  cleanMirrorImageCache.delete(oldest);
  }
}
function imageSummary(image) {
  return {
  host: safeHost(image.currentSrc || image.src),
  width: image.naturalWidth || image.width,
  height: image.naturalHeight || image.height,
  altLength: image.alt?.length ?? 0,
  frame: image.dataset.yomuCanvasFrame === "true" ? "canvas" : image.dataset.yomuBackgroundFrame === "true" ? "background" : "inline",
  className: image.className,
  parentId: image.parentElement?.id || ""
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
function isLocalOcrConnectionError(error) {
  if (isLocalOcrUnavailableError(error)) return true;
  if (!(error instanceof Error)) return true;
  return error.name === "TypeError" || error.name === "AbortError" || /network|failed to fetch|load failed|cors|blocked|timed out|timeout|request failed/i.test(error.message);
}
function isLocalOcrUnavailableError(error) {
  return error instanceof LocalOcrUnavailableError;
}
function safeHost(value) {
  try {
  return new URL(value, location.href).host;
  } catch {
  return "inline-or-invalid";
  }
}
const TARGET_OWNED_DOCUMENT_START_EVENT = "yomu:target-owned-document-start";
addWindowEventListener(TARGET_OWNED_DOCUMENT_START_EVENT, () => {
  installCanvasMirrorRecorder();
}, { once: true });
registerYomuCompanion("ocr", {
  ImageOcrController,
  normalizeOcrRenderedText
});
})();
