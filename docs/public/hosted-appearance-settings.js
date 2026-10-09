// src/reader/app/managed-storage-keys.ts
var MANAGED_STORAGE_KEY_PREFIXES = [
  "yomu-",
  "yomu:",
  "yomu.",
  // Yomu-internal redirect handoff keys use a leading double underscore.
  // Factory reset clears hosted web storage by managed prefix, so include it.
  "__yomu",
  "jpdb-reader-",
  "jpdb-popup-reader-"
];
var MANAGED_STATE_SLOT_KEY_PREFIX = "yomu:state-slot:v1:";
var MANAGED_WEB_STORAGE_SLOT_KEY_PREFIX = "yomu:web-storage-slot:v1:";
var MANAGED_SLOT_KEY_PREFIXES = [
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

// src/reader/core/async-utils.ts
function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

// src/reader/app/constants.ts
var FURIGANA_HIDE_STATE_GROUPS = ["known", "due", "failed", "learning", "new"];
var WORD_COLOR_HIDE_STATE_GROUPS = [...FURIGANA_HIDE_STATE_GROUPS, "ignored"];
var APP_NAME = "\u3088\u3080";
var APP_SLUG = "yomu";
var APP_REPOSITORY_NAME = `${APP_SLUG}-reader`;
var SETTINGS_TITLE = `${APP_NAME} Settings`;
var GITHUB_OWNER = "HRussellZFAC023";
var GITHUB_PAGES_ORIGIN = `https://${GITHUB_OWNER.toLowerCase()}.github.io`;
var DOCS_ORIGIN = "https://yomureader.com";
var DOCS_BASE_URL = `${DOCS_ORIGIN}/`;
var GITHUB_REPOSITORY_URL = `https://github.com/${GITHUB_OWNER}/${APP_REPOSITORY_NAME}`;
var USERSCRIPT_INSTALL_URL = `${DOCS_BASE_URL}yomu.user.js`;
var EXTENSION_STORE_URLS = {
  chrome: `${DOCS_BASE_URL}store/chrome/`,
  firefox: `${DOCS_BASE_URL}store/firefox/`,
  safari: `${DOCS_BASE_URL}store/safari/`
};
var NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;
var NEW_TAB_VERSION_URL = `${NEW_TAB_PAGE_URL}version.json`;
var VIDEO_PLAYER_PAGE_URL = `${DOCS_BASE_URL}video-player/`;
var PDF_READER_PAGE_URL = `${DOCS_BASE_URL}pdf-reader/`;
var NADESHIKO_URL = "https://nadeshiko.co/";
var NADESHIKO_DEVELOPER_URL = `${NADESHIKO_URL}user/developer`;
var USERSCRIPT_STORAGE_BRIDGE_READY_EVENT = "yomu-userscript-storage-bridge-ready";

// src/reader/app/build-mode.ts
var DEVELOPMENT_BUILD = false;

// src/reader/app/trusted-hosted-url.ts
var DOCS_PREVIEW_HOST = "yomureader.localhost";
var WEB_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
var EXTENSION_PROTOCOLS = /* @__PURE__ */ new Set(["chrome-extension:", "moz-extension:", "safari-web-extension:"]);
var TRUSTED_HTTPS_ORIGIN_KINDS = /* @__PURE__ */ new Map([
  [DOCS_ORIGIN, "docs"],
  [GITHUB_PAGES_ORIGIN, "github-pages"]
]);
var TRUSTED_WEB_HOST_KINDS = /* @__PURE__ */ new Map([
  [DOCS_PREVIEW_HOST, "docs-preview"],
  ["127.0.0.1", "loopback"],
  ["localhost", "loopback"],
  ["[::1]", "loopback"]
]);
var PRIVILEGED_LOCAL_DEVELOPMENT_ORIGINS = new Set(DEVELOPMENT_BUILD ? [
  "http://127.0.0.1:5174",
  "http://localhost:5174",
  "http://[::1]:5174"
] : []);
function isPrivilegedYomuLocalDevelopmentOrigin(origin) {
  return PRIVILEGED_LOCAL_DEVELOPMENT_ORIGINS.has(origin);
}
function readTrustedYomuUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const path = normalizeYomuHostedPath(url.pathname);
  const originKind = trustedYomuOriginKind(url, path);
  return originKind ? { url, path, originKind } : null;
}
function normalizeYomuHostedPath(pathname) {
  const normalized = pathname.replace(/\/index\.html$/u, "/");
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}
function isYomuRepositoryPath(path) {
  return path === `/${APP_REPOSITORY_NAME}/` || path.startsWith(`/${APP_REPOSITORY_NAME}/`);
}
function trustedYomuOriginKind(url, path) {
  return trustedHttpsOriginKind(url, path) ?? trustedWebHostKind(url) ?? trustedExtensionOriginKind(url);
}
function trustedHttpsOriginKind(url, path) {
  const originKind = TRUSTED_HTTPS_ORIGIN_KINDS.get(url.origin);
  if (originKind !== "github-pages") return originKind ?? null;
  return isYomuRepositoryPath(path) ? originKind : null;
}
function trustedWebHostKind(url) {
  if (!WEB_PROTOCOLS.has(url.protocol)) return null;
  return TRUSTED_WEB_HOST_KINDS.get(url.hostname) ?? null;
}
function trustedExtensionOriginKind(url) {
  if (!EXTENSION_PROTOCOLS.has(url.protocol)) return null;
  return url.hostname ? "extension" : null;
}

// src/reader/newtab/url.ts
var SETTINGS_PANEL_IDS = [
  "appearance",
  "backup",
  "api",
  "dictionaries",
  "media",
  "mining",
  "newTab",
  "shortcuts",
  "help"
];
var SETTINGS_PANEL_ID_SET = new Set(SETTINGS_PANEL_IDS);
var STUDY_ROUTE_POLICIES = {
  docs: isYomuStudyRoutePath,
  "docs-preview": isYomuStudyRoutePath,
  extension: isYomuStudyRoutePath,
  "github-pages": isRepositoryStudyRoutePath,
  loopback: isLoopbackStudyRoutePath
};
function isYomuNewTabUrl(value) {
  const appUrl = readTrustedYomuUrl(value);
  return appUrl ? isTrustedStudyRoute(appUrl) : false;
}
function isYomuStudyRoutePath(pathname) {
  const path = normalizeYomuHostedPath(pathname);
  return path === "/study/" || path === "/newtab/";
}
function isTrustedStudyRoute(appUrl) {
  const { originKind, path } = appUrl;
  return STUDY_ROUTE_POLICIES[originKind](path);
}
function isLoopbackStudyRoutePath(path) {
  return isYomuStudyRoutePath(path) || isRepositoryStudyRoutePath(path);
}
function isRepositoryStudyRoutePath(path) {
  return path === `/${APP_REPOSITORY_NAME}/study/` || path === `/${APP_REPOSITORY_NAME}/newtab/`;
}

// src/reader/app/pages-url.ts
var PRIVILEGED_APP_POLICIES = {
  docs: isYomuActiveAppRoute,
  "github-pages": isYomuActiveAppRoute,
  extension: () => false,
  loopback: isPrivilegedLocalAppRoute,
  "docs-preview": isPrivilegedLocalAppRoute
};
function isYomuPrivilegedHostedAppUrl(value) {
  const appUrl = readTrustedYomuUrl(value);
  return appUrl ? PRIVILEGED_APP_POLICIES[appUrl.originKind](value, appUrl) : false;
}
function isYomuStorageBridgeHostedUrl(value) {
  const appUrl = readTrustedYomuUrl(value);
  if (!appUrl) return false;
  if (appUrl.originKind === "docs" || appUrl.originKind === "github-pages") return true;
  return isYomuPrivilegedHostedAppUrl(value);
}
function isYomuActiveAppRoute(value, appUrl) {
  return isYomuNewTabUrl(value) || isExactHostedAppPath(appUrl, "video-player") || isExactHostedAppPath(appUrl, "pdf-reader") || isExactHostedAppPath(appUrl, "academy");
}
function isPrivilegedLocalAppRoute(value, appUrl) {
  return isPrivilegedYomuLocalDevelopmentOrigin(appUrl.url.origin) && isYomuActiveAppRoute(value, appUrl);
}
function isExactHostedAppPath(appUrl, route) {
  if (appUrl.originKind === "github-pages") {
    return appUrl.path === `/${APP_REPOSITORY_NAME}/${route}/`;
  }
  return appUrl.path === `/${route}/` || appUrl.originKind === "loopback" && appUrl.path === `/${APP_REPOSITORY_NAME}/${route}/`;
}

// src/reader/userscript/gm-api.ts
function userscriptGmApi() {
  const lexical = typeof GM === "object" && GM ? GM : void 0;
  return lexical ?? globalRecord("GM");
}
function userscriptGmInfo() {
  const lexical = typeof GM_info === "object" && GM_info ? GM_info : void 0;
  return lexical ?? globalRecord("GM_info") ?? userscriptGmApi()?.info;
}
function globalRecord(name) {
  const value = globalThis[name];
  return value && typeof value === "object" ? value : void 0;
}

// src/reader/app/runtime-env.ts
function extensionRuntimeMayBeYomu() {
  return !(typeof __YOMU_EXTENSION_BUILD__ === "boolean" && !__YOMU_EXTENSION_BUILD__);
}

// src/reader/app/runtime-presence.ts
var INSTALLED_READER_RUNTIME_MARKER_ID = "jpdb-reader-installed-runtime";
function detectInstalledReaderRuntime(globals = globalThis) {
  if (extensionRuntimeMayBeYomu() && (globals.chrome?.runtime?.id || globals.browser?.runtime?.id)) return "extension";
  return userscriptManagerApi(globals) ? "userscript" : null;
}
function userscriptManagerApi(globals) {
  const ambient = globals === globalThis;
  const gm = ambient ? userscriptGmApi() : globals.GM;
  return ambient && typeof GM_getValue === "function" || typeof globals.GM_getValue === "function" || typeof gm?.getValue === "function" || typeof gm?.xmlHttpRequest === "function" || typeof gm?.xmlhttpRequest === "function" || Boolean(ambient ? userscriptGmInfo() : globals.GM_info);
}
function announcedInstalledReaderRuntime(root = document) {
  const kind = root.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)?.dataset?.yomuInstalledRuntimeKind;
  return kind === "extension" || kind === "userscript" ? kind : null;
}

// src/reader/userscript/bridge-authority.ts
function expectedBridgeKind(trustedPage) {
  if (detectInstalledReaderRuntime()) return null;
  const announced = announcedInstalledReaderRuntime();
  return announced && trustedPage() ? announced : null;
}
function readyBridgeOwner(dataset, keys, expected) {
  if (dataset?.[keys.ready] !== "true") return null;
  const kind = dataset[keys.kind];
  if (kind === "extension" || kind === "userscript") {
    if (expected && kind !== expected && kind !== "extension") return null;
    return { ownerId: dataset[keys.owner], kind };
  }
  return { ownerId: dataset[keys.owner], kind: expected ?? "userscript" };
}

// src/reader/userscript/bridge-detail.ts
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

// src/reader/core/attempt.ts
var recorder = () => void 0;
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

// src/reader/platform/window-events.ts
var initialWindowDispatchEvent = initialWindowMethod("dispatchEvent");
var initialWindowAddEventListener = initialWindowMethod("addEventListener");
var initialWindowRemoveEventListener = initialWindowMethod("removeEventListener");
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
  const directResult = callAddEventListener(directAdd, target, type, listener, options);
  if (directResult.called) return true;
  const initialResult = initialWindowAddEventListener === directAdd ? { called: false } : callAddEventListener(initialWindowAddEventListener, target, type, listener, options);
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
  const directResult = callRemoveEventListener(directRemove, target, type, listener, options);
  if (directResult.called) return true;
  const initialResult = initialWindowRemoveEventListener === directRemove ? { called: false } : callRemoveEventListener(initialWindowRemoveEventListener, target, type, listener, options);
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
    const result = callAddEventListener(prototypeAdd, target, type, listener, options);
    if (result.called) return result;
  }
  return { called: false };
}
function removeListenerWithPrototypeMethod(target, directRemove, type, listener, options) {
  for (const prototypeRemove of eventTargetPrototypeMethods(target, "removeEventListener")) {
    if (prototypeRemove === directRemove) continue;
    const result = callRemoveEventListener(prototypeRemove, target, type, listener, options);
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
function callAddEventListener(method, target, type, listener, options) {
  if (!method) return { called: false };
  try {
    method.call(target, type, listener, options);
    return { called: true };
  } catch (error) {
    return { called: false, error };
  }
}
function callRemoveEventListener(method, target, type, listener, options) {
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
    return callAddEventListener(readMethod(window, "addEventListener"), window, type, listener, options);
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
    return callRemoveEventListener(readMethod(window, "removeEventListener"), window, type, listener, options);
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

// src/reader/userscript/storage-bridge.ts
var BRIDGE_REQUEST_EVENT = "yomu-userscript-storage-request";
var BRIDGE_RESPONSE_EVENT = "yomu-userscript-storage-response";
var BRIDGE_MARKER = "yomuUserscriptStorageBridge";
var BRIDGE_OWNER = "yomuStorageBridgeOwner";
var BRIDGE_KIND = "yomuStorageBridgeKind";
var BRIDGE_KEYS = { ready: BRIDGE_MARKER, owner: BRIDGE_OWNER, kind: BRIDGE_KIND };
var EXTENSION_STORAGE_BRIDGE_MARKER = "yomuExtensionStorageBridge";
var EXTENSION_STORAGE_TARGET = "extension-storage";
var BRIDGE_TIMEOUT_MS = 1e4;
var clientOwner;
function getUserscriptGmStorage() {
  if (!storageBridgeClientAvailable()) return void 0;
  clientOwner ??= pinnableOwner(readyBridgeOwner(bridgeMarkerDataset(), BRIDGE_KEYS, expectedStorageBridgeKind()));
  const request = (detail) => storageBridgeRequest(detail);
  return {
    getValue: (key, fallback) => request({ op: "get", key }).then((detail) => detail.found ? detail.value : fallback),
    setValue: (key, value) => request({ op: "set", key, value }).then(() => void 0),
    deleteValue: (key) => request({ op: "delete", key }).then(() => void 0),
    listValues: () => request({ op: "list" }).then((detail) => detail.keys ?? []),
    clearPrivateManagedValues: () => request({ op: "clear-private-managed" }).then(() => void 0),
    clearLegacyExtensionManagedValues: () => extensionStorageBridgeAdvertised() ? request({
      op: "clear-legacy-extension-managed",
      target: EXTENSION_STORAGE_TARGET
    }).then(() => void 0) : Promise.resolve()
  };
}
function storageBridgeClientAvailable() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return Boolean(clientOwner || expectedStorageBridgeKind() || readyBridgeOwner(bridgeMarkerDataset(), BRIDGE_KEYS, null));
}
function expectedStorageBridgeKind() {
  return expectedBridgeKind(shouldInstallUserscriptStorageBridge);
}
function storageBridgeRequest(request) {
  return new Promise((resolve, reject) => {
    const id = `yomu-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    let pinned;
    let cleanupListeners = noop;
    const cleanup = () => {
      window.clearTimeout(timeout);
      cleanupListeners();
    };
    const fail = (message) => {
      cleanup();
      reject(new Error(message));
    };
    const timeout = window.setTimeout(() => {
      if (!pinned) fail("Installed Yomu storage did not connect; reload to reconnect.");
      else if (!pinnedOwnerCurrent(pinned)) fail("Storage bridge authority changed during the request.");
      else fail("Storage bridge request timed out.");
    }, BRIDGE_TIMEOUT_MS);
    const onResponse = (event) => {
      const detail = storageBridgeResponseDetail(event);
      if (!detail || detail.id !== id) return;
      if (!pinned || !pinnedOwnerCurrent(pinned)) return fail("Storage bridge authority changed during the request.");
      cleanup();
      if (detail.ok) resolve(detail);
      else reject(new Error(detail.message || "Storage bridge request failed."));
    };
    const send = (owner) => {
      pinned = owner;
      cleanupListeners();
      cleanupListeners = addBridgeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
      dispatchBridgeEvent(BRIDGE_REQUEST_EVENT, { id, ownerId: owner.ownerId, ...request });
    };
    const connect = () => {
      if (clientOwner) {
        if (pinnedOwnerCurrent(clientOwner)) send(clientOwner);
        else fail("Storage bridge authority changed; reload to reconnect.");
        return true;
      }
      const owner = readyBridgeOwner(bridgeMarkerDataset(), BRIDGE_KEYS, expectedStorageBridgeKind());
      if (!owner) return false;
      clientOwner = pinnableOwner(owner);
      send(owner);
      return true;
    };
    if (connect()) return;
    cleanupListeners = addBridgeEventListener(USERSCRIPT_STORAGE_BRIDGE_READY_EVENT, () => {
      if (!pinned) connect();
    });
  });
}
function pinnableOwner(owner) {
  return owner?.ownerId === void 0 ? void 0 : owner;
}
function pinnedOwnerCurrent(owner) {
  const dataset = bridgeMarkerDataset();
  return dataset?.[BRIDGE_MARKER] === "true" && dataset[BRIDGE_OWNER] === owner.ownerId;
}
function shouldInstallUserscriptStorageBridge() {
  try {
    return typeof location !== "undefined" && isYomuStorageBridgeHostedUrl(location.href);
  } catch {
    return false;
  }
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
function extensionStorageBridgeAdvertised() {
  return bridgeMarkerDataset()?.[EXTENSION_STORAGE_BRIDGE_MARKER] === "true";
}
function addBridgeEventListener(type, listener) {
  const cleanups = [];
  if (addWindowEventListener(type, listener)) {
    cleanups.push(() => removeWindowEventListener(type, listener));
  }
  const documentTarget = bridgeDocumentTarget();
  if (documentTarget && callAddEventListener2(documentTarget, type, listener)) {
    cleanups.push(() => callRemoveEventListener2(documentTarget, type, listener));
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
function callAddEventListener2(target, type, listener) {
  try {
    target.addEventListener(type, listener);
    return true;
  } catch {
    return false;
  }
}
function callRemoveEventListener2(target, type, listener) {
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

// src/reader/app/managed-state-registry.ts
var entries = [];
var registeredEntryIndexes = /* @__PURE__ */ new Map();
var resetWritesSuppressed = false;
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
function managedStateEntries() {
  return entries;
}
function managedStateWritesSuppressed() {
  return resetWritesSuppressed;
}

// src/reader/companions/registry.ts
var sandboxCompanions = {};
function yomuLocalDictionaries() {
  return yomuCompanions().localDictionaries;
}
function yomuCompanions() {
  return readYomuCompanions(globalThis) ?? sandboxCompanions ?? (typeof window === "undefined" ? void 0 : readYomuCompanions(window)) ?? {};
}
function readYomuCompanions(target) {
  if (!target || typeof target !== "object" && typeof target !== "function") return void 0;
  try {
    return target.__yomuCompanions;
  } catch {
    return void 0;
  }
}

// src/reader/app/managed-state-manifest.ts
async function enumerateDictionaryArchiveStorageKeys() {
  const enumerate = yomuLocalDictionaries()?.enumerateDictionaryArchiveStorageKeys;
  if (!enumerate) throw new Error("The local-dictionary companion cannot enumerate archive storage.");
  return enumerate();
}
var MANAGED_STATE_MANIFEST = [
  // Settings (also legacy migration keys). The bunpro token / pill selections /
  // colours all live inside these settings objects.
  { owner: "settings", kind: "gm", key: "jpdb-popup-reader-settings" },
  { owner: "settings (legacy)", kind: "gm", key: "jpdb-reader-settings" },
  { owner: "settings (legacy)", kind: "gm", key: "yomu-reader-settings" },
  { owner: "settings (legacy)", kind: "gm", key: "yomu-settings" },
  { owner: "settings", kind: "gm", key: "yomu:prefer-japanese-site-language:v1" },
  { owner: "settings (pre-ledger pins)", kind: "gm", key: "yomu:explicit-user-settings:v1" },
  { owner: "settings/intent-ledger", kind: "gm", key: "yomu:settings-intent:v2" },
  { owner: "settings (retired promotion marker; purge only)", kind: "gm", key: "yomu:extension-study-legacy-promotion:v1" },
  // Private, one-use cloud settings OAuth handoff. The old page-readable key
  // remains reset-only so upgrades erase a stranded pre-1.9 callback marker.
  { owner: "settings/dialog-controller", kind: "gm", key: "yomu:private:cloud-settings-sync-pending:v1" },
  { owner: "settings/dialog-controller (legacy)", kind: "gm", key: "__yomu_cloud_settings_sync_pending_action" },
  // App-level signals / flags / caches.
  { owner: "app/storage", kind: "gm", key: "yomu:factory-reset-signal" },
  { owner: "app/storage epoch", kind: "gm", key: "yomu:state-epoch" },
  { owner: "app/storage epoch slots", kind: "gm", prefix: "yomu:state-slot:v1:" },
  { owner: "app/storage epoch lease", kind: "gm", prefix: "yomu:state-epoch-lease:v1:" },
  { owner: "app/managed-web-storage", kind: "local", key: "yomu:web-storage-epoch:v1:local" },
  { owner: "app/managed-web-storage", kind: "session", key: "yomu:web-storage-epoch:v1:session" },
  { owner: "app/managed-web-storage", kind: "local", prefix: "yomu:web-storage-slot:v1:" },
  { owner: "app/managed-web-storage", kind: "session", prefix: "yomu:web-storage-slot:v1:" },
  { owner: "app/managed-web-storage", kind: "local", prefix: "yomu:web-owner:v2:" },
  { owner: "app/managed-web-storage", kind: "session", prefix: "yomu:web-owner:v2:" },
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
  // The one-time reader-canvas tap hint appears once per site. Each site's record
  // is private and keyed by a hash of its origin, so no page can read it.
  { owner: "ocr/reader-canvas-tap-hint", kind: "gm", prefix: "yomu:private:ocr-canvas-tap-hint-seen:v1:" },
  // The popup grade keycaps retire after the learner's first popup grade.
  { owner: "cards/grade-key-hints", kind: "gm", key: "yomu:private:grade-key-hints-retired:v1" },
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
  { owner: "study/practice-session", kind: "idb", key: "yomu-practice-sessions-v1" },
  { owner: "study/practice-session", kind: "session", key: "yomu:practice-session-tab:v1" },
  { owner: "newtab/state", kind: "gm", key: "jpdb-reader-newtab-ui" },
  { owner: "newtab/cache", kind: "gm", key: "jpdb-reader-newtab-card-cache" },
  { owner: "newtab/controller-config", kind: "gm", key: "jpdb-reader-newtab-grade-queue" },
  { owner: "newtab/grade-queue", kind: "gm", key: "yomu:newtab-live-review:v1" },
  { owner: "newtab/review-queue-owner", kind: "gm", key: "yomu:private:review-delivery:v2" },
  { owner: "newtab/packaged-review-queue-client", kind: "session", key: "yomu:review-action-draft:v2" },
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
var manifestRegistered = false;
function registerManagedStateManifest() {
  if (manifestRegistered) return;
  manifestRegistered = true;
  registerManagedStates(MANAGED_STATE_MANIFEST);
}
registerManagedStateManifest();

// src/reader/app/managed-state-epoch.ts
var MANAGED_STATE_EPOCH_KEY = "yomu:state-epoch";
var MANAGED_STATE_ENVELOPE_VERSION = 1;
var MANAGED_STATE_EPOCH_SESSION_SLOT = Symbol.for("yomu.managed-state-epoch-session.v1");
var MANAGED_STATE_EPOCH_CANONICAL_SESSION_SLOT = Symbol.for("yomu.managed-state-epoch-canonical-session.v1");
var INITIAL_MANAGED_STATE_EPOCH = Object.freeze({
  version: 1,
  generation: 0,
  resetId: "legacy",
  committedAt: 0
});
var StaleManagedStateEpochError = class extends Error {
  constructor(expected, actual) {
    super(`Managed state belongs to epoch ${managedStateEpochToken(expected)}, but the current epoch is ${managedStateEpochToken(actual)}.`);
    this.expected = expected;
    this.actual = actual;
    this.name = "StaleManagedStateEpochError";
  }
  code = "YOMU_STALE_MANAGED_STATE_EPOCH";
};
function isStaleManagedStateEpochError(error) {
  return Boolean(error && typeof error === "object" && error.code === "YOMU_STALE_MANAGED_STATE_EPOCH");
}
var ManagedStateEpochSession = class {
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
};
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
  if (!isPlainRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 1 || typeof value.resetId !== "string" || !value.resetId.trim() || typeof value.committedAt !== "number" || !Number.isFinite(value.committedAt) || value.committedAt <= 0) {
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
  return isPlainRecord(value) && value.__yomuManagedStateEnvelope === MANAGED_STATE_ENVELOPE_VERSION && typeof value.epoch === "string" && Object.hasOwn(value, "value");
}
function isManagedStateEpochSession(value) {
  return Boolean(value && typeof value === "object" && typeof value.current === "function" && typeof value.capture === "function" && typeof value.assertCurrent === "function" && typeof value.resetForTests === "function");
}
function isPlainRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

// src/reader/app/managed-read-path.ts
var MISSING = { __yomuStorageValueMissing: true };
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

// src/reader/app/hosted-storage-fallback.ts
var HOSTED_SETTINGS_BLOB_KEY = "jpdb-popup-reader-settings";
function isHostedSettingsStorageKey(key) {
  return key === HOSTED_SETTINGS_BLOB_KEY;
}
function isHostedYomuLocation(origin, hostname, pathname) {
  if (origin === DOCS_ORIGIN) return true;
  if (isHostedGithubPagesLocation(hostname, pathname)) return true;
  return isHostedLocalDevelopmentLocation(origin, pathname);
}
function isHostedYomuOrigin() {
  try {
    return isHostedYomuLocation(location.origin, location.hostname, location.pathname);
  } catch {
    return false;
  }
}
function isHostedGithubPagesLocation(hostname, pathname) {
  return hostname === "hrussellzfac023.github.io" && pathname.startsWith("/yomu-reader/");
}
function isHostedLocalDevelopmentLocation(origin, pathname) {
  if (!isPrivilegedYomuLocalDevelopmentOrigin(origin)) return false;
  return pathname.includes("/study/") || pathname.includes("/newtab/");
}

// src/reader/app/managed-web-storage.ts
var OWNER_PREFIX = "yomu:web-owner:v2:";
var selectedOwner;
function ownedKey(key) {
  return selectedOwner && selectedOwner !== "standalone" ? `${OWNER_PREFIX}${selectedOwner}:${key}` : key;
}
var AREA_MARKER_KEYS = {
  local: "yomu:web-storage-epoch:v1:local",
  session: "yomu:web-storage-epoch:v1:session"
};
var PRESERVED_LOCAL_CONTROL_KEYS = /* @__PURE__ */ new Set([
  MANAGED_STATE_EPOCH_KEY,
  AREA_MARKER_KEYS.local
]);
var certifiedEpoch;
var managedLocalStorage = managedStorageFacade("local");
var managedSessionStorage = managedStorageFacade("session");
function managedStorageFacade(area) {
  return {
    getItem(key) {
      const { storage, epoch } = certifiedArea(area);
      const own = logicalItem(readStorageValue(storage, physicalStorageKey(key, epoch), `${area}Storage key "${key}"`), epoch);
      if (own !== null) return own;
      const earlier = earlierLocalRecordKey(area, key, epoch);
      return earlier ? logicalItem(readStorageValue(storage, earlier, `localStorage key "${key}"`), epoch) : null;
    },
    setItem(key, value) {
      assertManagedLogicalKey(key);
      const { storage, epoch } = certifiedArea(area);
      const stored = epoch.generation === 0 ? value : JSON.stringify(managedStateStoredValue(value, epoch));
      writeAndVerify(storage, physicalStorageKey(key, epoch), stored, `${area}Storage key "${key}"`);
      removeEarlierLocalRecord(area, key, epoch);
      assertAreaCertificate(area, epoch);
    },
    removeItem(key) {
      assertManagedLogicalKey(key);
      const { storage, epoch } = certifiedArea(area);
      removeVerified(storage, physicalStorageKey(key, epoch), `${area}Storage key "${key}"`, `${area}Storage retained managed key "${key}".`);
      removeEarlierLocalRecord(area, key, epoch);
      assertAreaCertificate(area, epoch);
    }
  };
}
function earlierLocalRecordKey(area, key, epoch) {
  if (area !== "local" || !selectedOwner || selectedOwner === "standalone") return null;
  const storage = storageArea("local");
  const marker = readStorageValue(storage, AREA_MARKER_KEYS.local, "localStorage earlier epoch marker");
  return marker === managedStateEpochToken(epoch) ? epochSlotKey(key, epoch) : null;
}
function removeEarlierLocalRecord(area, key, epoch) {
  const earlier = isHostedYomuOrigin() ? null : earlierLocalRecordKey(area, key, epoch);
  if (earlier) removeVerified(storageArea("local"), earlier, `localStorage key "${key}"`, `localStorage retained earlier managed key "${key}".`);
}
function removeVerified(storage, key, label, retained) {
  removeStorageValue(storage, key, label);
  if (readStorageValue(storage, key, label) !== null) throw new Error(retained);
}
function logicalItem(raw, epoch) {
  if (raw === null || epoch.generation === 0) return raw;
  try {
    const unreadable = Symbol("unreadable-managed-web-storage");
    const value = managedStateLogicalValue(JSON.parse(raw), epoch, unreadable);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
function certifiedArea(area) {
  const epoch = certifiedEpoch;
  if (!epoch) throw new Error("Managed web storage has not passed its epoch barrier.");
  assertAreaCertificate(area, epoch);
  return { storage: storageArea(area), epoch };
}
function assertAreaCertificate(area, epoch) {
  const marker = readStorageValue(storageArea(area), ownedKey(AREA_MARKER_KEYS[area]), `${area}Storage epoch marker`);
  if (marker !== managedStateEpochToken(epoch)) {
    throw new Error(`${area}Storage is not certified for the captured managed-state epoch.`);
  }
}
function physicalStorageKey(key, epoch) {
  return ownedKey(epochSlotKey(key, epoch));
}
function epochSlotKey(key, epoch) {
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
    const storage = area === "local" ? localStorage : sessionStorage;
    if (!storage) throw new Error(`${area}Storage is unavailable.`);
    return storage;
  } catch (error) {
    throw new Error(`${area}Storage is unavailable.`, { cause: error });
  }
}
function readStorageValue(storage, key, label) {
  try {
    return storage.getItem(key);
  } catch (error) {
    throw new Error(`${label} could not be read.`, { cause: error });
  }
}
function writeAndVerify(storage, key, value, label) {
  try {
    storage.setItem(key, value);
  } catch (error) {
    throw new Error(`${label} could not be written.`, { cause: error });
  }
  if (readStorageValue(storage, key, label) !== value) throw new Error(`${label} failed read-back verification.`);
}
function removeStorageValue(storage, key, label) {
  try {
    storage.removeItem(key);
  } catch (error) {
    throw new Error(`${label} could not be removed.`, { cause: error });
  }
}

// src/reader/app/gm-storage-lease.ts
var MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX = "yomu:state-epoch-lease:v1:";
var STORAGE_LEASE_KEY_PREFIX = "yomu:lease:";
var STORAGE_WORK_LEASE_MS = 5e3;
var DEFAULT_LEASE_MS = 6e4;
var LEASE_ROUND_TRIPS = 20;
var WAIT_NOTICE_MS = 1500;
var StorageLeaseLapsedError = class extends Error {
  name = "StorageLeaseLapsedError";
  constructor(key) {
    super(`Storage lease lapsed before it was renewed: ${key}`);
  }
};
function isStorageLeaseLapsed(error) {
  return error instanceof Error && error.name === "StorageLeaseLapsedError";
}
var guardingLeases = /* @__PURE__ */ new Set();
var realmClaimOwners = /* @__PURE__ */ new Set();
var realmWebLockRequests = /* @__PURE__ */ new Map();
function fenceStorageLeaseWrite(key) {
  for (const lease of guardingLeases) if (lease.guards(key)) lease.fenceWrite();
}
async function withGmStorageLeaseCore(name, operation, options, environment) {
  const wait = new StorageLeaseWait(options.onWait);
  const boundedLockWait = !environment.hostedOrigin && storageLeaseIo(environment.backend);
  const lockWaitMs = boundedLockWait ? options.leaseMs ?? DEFAULT_LEASE_MS : void 0;
  try {
    return await withWebStorageLock(name, () => withSharedStorageLease(name, () => {
      wait.end();
      return operation();
    }, options, environment, wait), wait, lockWaitMs);
  } finally {
    wait.end();
  }
}
var StorageLeaseWait = class {
  constructor(onWait) {
    this.onWait = onWait;
  }
  state = "running";
  timer;
  /** Another tab holds the lease, or is ahead in its queue. */
  blocked() {
    if (!this.onWait || this.state !== "running") return;
    this.state = "blocked";
    this.timer = setTimeout(() => {
      this.state = "told";
      this.onWait?.(true);
    }, WAIT_NOTICE_MS);
  }
  /** The caller got past what blocked it; a wait it was not yet told about starts over. */
  passed() {
    if (this.state !== "blocked") return;
    clearTimeout(this.timer);
    this.state = "running";
  }
  end() {
    clearTimeout(this.timer);
    if (this.state === "told") this.onWait?.(false);
    this.state = "ended";
  }
};
async function withSharedStorageLease(name, operation, options, environment, wait) {
  const { getValue } = environment.backend;
  const epoch = await environment.captureEpoch(getValue);
  await environment.assertMutationFence(getValue, epoch);
  const io = storageLeaseIo(environment.backend);
  if (!io) {
    const result = await operation();
    await environment.assertMutationFence(getValue, epoch);
    return result;
  }
  const leaseMs = boundedLeaseOption(options.leaseMs, DEFAULT_LEASE_MS, 1e3, 10 * 6e4);
  return new StorageLeaseClaimant({
    guards: options.guards,
    prefix: `${STORAGE_LEASE_KEY_PREFIX}${normalizedStorageLeaseName(name)}:`,
    epoch: environment.epochToken(epoch),
    io,
    fence: () => environment.assertMutationFence(getValue, epoch),
    leaseMs,
    pollMs: boundedLeaseOption(options.pollMs, 20, 1, 1e3),
    timeoutMs: boundedLeaseOption(options.timeoutMs, 9e4, leaseMs, 15 * 6e4),
    timeoutMessage: `Timed out waiting for storage lease: ${name}`,
    wait
  }).run(operation);
}
function storageLeaseIo(backend) {
  const { getValue, setValue, deleteValue, listValues } = backend;
  return [getValue, setValue, deleteValue, listValues].every(Boolean) ? backend : null;
}
var StorageLeaseClaimant = class {
  constructor(lease) {
    this.lease = lease;
    const owner = createStorageCoordinationId();
    this.key = `${lease.prefix}${owner}`;
    this.promptLandingMs = Math.min(1e3, Math.floor(lease.leaseMs / 5));
    this.claim = {
      version: 1,
      claimId: createStorageCoordinationId(),
      owner,
      epoch: lease.epoch,
      choosing: true,
      ticket: 0,
      leaseUntil: 0
    };
  }
  key;
  startedAt = Date.now();
  // Time for a write to land while the claim it extends is still live, when storage is prompt.
  promptLandingMs;
  claim;
  // The leaseUntil other tabs can already read: a claim counts once its write has landed.
  liveUntil = 0;
  // How long storage took to answer one call of the last claim write.
  roundTripMs = 0;
  async run(operation) {
    realmClaimOwners.add(this.claim.owner);
    try {
      await this.waitForTurn();
      return await this.hold(operation);
    } finally {
      const { getValue, deleteValue } = this.lease.io;
      try {
        await deleteStorageLeaseClaimIfOwned(this.key, this.claim, getValue, deleteValue);
      } catch (error) {
        debugStorageLeaseError("GM storage lease release failed", this.key, error);
      }
      realmClaimOwners.delete(this.claim.owner);
    }
  }
  /**
   * A claim must outlast the storage round trips its holder makes before it
   * renews, so slow storage stretches it by LEASE_ROUND_TRIPS of them, up to
   * the default lease: slowness delays a save instead of lapsing it.
   */
  leaseMs() {
    const { leaseMs } = this.lease;
    return Math.min(leaseMs + LEASE_ROUND_TRIPS * this.roundTripMs, Math.max(leaseMs, DEFAULT_LEASE_MS));
  }
  // Slow storage takes longer to land a write: allow it two round trips.
  live() {
    return Date.now() + Math.max(this.promptLandingMs, 2 * this.roundTripMs) < this.liveUntil;
  }
  async waitForTurn() {
    const { lease } = this;
    while (true) {
      await lease.fence();
      if (Date.now() - this.startedAt >= lease.timeoutMs) throw new Error(lease.timeoutMessage);
      try {
        if (!this.live()) await this.queue();
        else if (this.liveUntil - Date.now() <= this.leaseMs() / 2) await this.writeClaim();
      } catch (error) {
        if (error instanceof StorageLeaseLapsedError) continue;
        throw error;
      }
      const ahead = await this.claimsAhead();
      if (!ahead.length && this.live()) return;
      if (ahead.some((other) => !realmClaimOwners.has(other.owner))) lease.wait?.blocked();
      await storageLeaseDelay(lease.pollMs);
    }
  }
  async queue() {
    const { prefix, epoch, io: { listValues, getValue } } = this.lease;
    await this.writeClaim({ choosing: true, ticket: 0 }, true);
    const claims = await readStorageLeaseClaims(prefix, listValues, getValue, epoch, Date.now());
    const highestTicket = claims.reduce((highest, item) => Math.max(highest, item.ticket), 0);
    await this.writeClaim({ choosing: false, ticket: highestTicket + 1 });
  }
  async claimsAhead() {
    const { prefix, epoch, io: { listValues, getValue } } = this.lease;
    const { owner, ticket } = this.claim;
    const claims = await readStorageLeaseClaims(prefix, listValues, getValue, epoch, Date.now());
    return claims.filter((other) => other.owner !== owner && (other.choosing || other.ticket < ticket || other.ticket === ticket && other.owner.localeCompare(owner) < 0));
  }
  /** `requeue` writes a new place in the queue instead of extending the live claim. */
  async writeClaim(changes = {}, requeue = false) {
    const { getValue, setValue } = this.lease.io;
    if (!requeue && !this.live()) throw new StorageLeaseLapsedError(this.key);
    const writtenAt = Date.now();
    const next = { ...this.claim, ...changes, leaseUntil: writtenAt + this.leaseMs() };
    this.claim = next;
    try {
      await setValue(this.key, next);
      const landedAt = Date.now();
      this.liveUntil = next.leaseUntil;
      await assertStorageLeaseClaimOwned(this.key, next, getValue);
      this.roundTripMs = storageRoundTripMs(landedAt - writtenAt, Date.now() - landedAt, this.lease.leaseMs);
    } catch (error) {
      await this.rollBack();
      throw error;
    }
  }
  /** Deletes the claim this realm wrote, unless another has taken its key. */
  async rollBack() {
    const { getValue, deleteValue } = this.lease.io;
    await deleteStorageLeaseClaimIfOwned(this.key, this.claim, getValue, deleteValue).catch((error) => {
      debugStorageLeaseError("GM storage lease rollback failed", this.key, error);
    });
  }
  /**
   * A holder's renewal. A factory reset in another tab deletes every claim,
   * then checks that none is left while this section may still be running:
   * a renewal reads the claim first and never writes back one that is gone,
   * and takes back one the reset deleted while the write was in flight, which
   * the fence after it reveals. The renewal on entry skips the read: the
   * waiter's last poll fenced a moment ago, and once storage turns slow it
   * may enter with little of its claim left.
   */
  async renew(due, entry) {
    if (!entry) await assertStorageLeaseClaimOwned(this.key, this.claim, this.lease.io.getValue);
    do
      await this.writeClaim();
    while (due());
    await this.lease.fence().catch(async (error) => {
      await this.rollBack();
      throw error;
    });
  }
  /**
   * Runs the operation while a timer renews the claim and, for a lease with
   * `guards`, while each guarded write renews it too: those writes reach
   * storage over messaging, so throttled timers cannot starve them.
   */
  async hold(operation) {
    const { lease, key } = this;
    const { getValue } = lease.io;
    const renewEveryMs = Math.max(250, Math.floor(lease.leaseMs / 3));
    let held = true;
    let lost;
    let refused = false;
    let renewal;
    const due = () => held && this.liveUntil - Date.now() <= this.leaseMs() * 5 / 6;
    const renewIfDue = (entry = false) => {
      if (lost || renewal || !due()) return;
      renewal = this.renew(due, entry).catch((error) => {
        lost ??= { error };
        debugStorageLeaseError("GM storage lease renewal failed", key, error);
      }).finally(() => {
        renewal = void 0;
      });
    };
    const guarding = lease.guards && {
      guards: lease.guards,
      fenceWrite: () => {
        if (!lost && !this.live()) lost = { error: new StorageLeaseLapsedError(key) };
        if (lost) {
          refused = true;
          throw lost.error;
        }
        renewIfDue();
      }
    };
    if (guarding) guardingLeases.add(guarding);
    const timer = setInterval(() => renewIfDue(), renewEveryMs);
    renewIfDue(true);
    let outcome;
    try {
      await lease.fence();
      await assertStorageLeaseClaimOwned(key, this.claim, getValue);
      const value = await operation();
      await lease.fence();
      await assertStorageLeaseClaimOwned(key, this.claim, getValue);
      outcome = { value };
    } catch (error) {
      outcome = { error };
    } finally {
      held = false;
      if (guarding) guardingLeases.delete(guarding);
      clearInterval(timer);
      await renewal;
    }
    if ("error" in outcome) throw outcome.error;
    if (lost && (!guarding || refused)) throw lost.error;
    return outcome.value;
  }
};
async function readStorageLeaseClaims(prefix, listValues, getValue, epochToken, now) {
  const keys = (await listValues()).filter((key) => key.startsWith(prefix));
  const values = await Promise.all(keys.map((key) => getValue(key, null)));
  return values.flatMap((value) => {
    const claim = parseStorageLeaseClaim(value);
    return claim && claim.epoch === epochToken && claim.leaseUntil > now ? [claim] : [];
  });
}
function parseStorageLeaseClaim(value) {
  if (!isPlainRecord2(value) || value.version !== 1 || typeof value.owner !== "string" || value.claimId !== void 0 && typeof value.claimId !== "string" || value.epoch !== void 0 && typeof value.epoch !== "string" || typeof value.choosing !== "boolean" || !Number.isSafeInteger(value.ticket) || value.ticket < 0 || !Number.isSafeInteger(value.leaseUntil)) return null;
  return {
    version: 1,
    claimId: value.claimId || value.owner,
    owner: value.owner,
    epoch: value.epoch || "0:legacy",
    choosing: value.choosing,
    ticket: value.ticket,
    leaseUntil: value.leaseUntil
  };
}
async function assertStorageLeaseClaimOwned(key, expected, getValue) {
  const actual = parseStorageLeaseClaim(await getValue(key, null));
  if (!actual || !sameStorageLeaseClaimIdentity(actual, expected)) {
    throw new Error(`Storage lease ownership was lost: ${key}`);
  }
}
async function deleteStorageLeaseClaimIfOwned(key, expected, getValue, deleteValue) {
  const actual = parseStorageLeaseClaim(await getValue(key, null));
  if (actual && sameStorageLeaseClaimIdentity(actual, expected)) await deleteValue(key);
}
function sameStorageLeaseClaimIdentity(left, right) {
  return left.claimId === right.claimId && left.owner === right.owner && left.epoch === right.epoch;
}
function normalizedStorageLeaseName(name) {
  const normalized = name.trim().replaceAll(/[^a-z0-9._-]+/giu, "-").slice(0, 80);
  if (!normalized) throw new TypeError("Storage lease name is required.");
  return normalized;
}
function boundedLeaseOption(value, fallback, minimum, maximum) {
  if (value === void 0) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError("Invalid storage lease option.");
  return value;
}
function storageLeaseDelay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function storageRoundTripMs(writeMs, readMs, leaseMs) {
  const slower = Math.max(writeMs, readMs);
  return slower <= leaseMs / 4 ? slower : Math.min(writeMs, readMs);
}
function webLockManager() {
  return typeof navigator === "undefined" ? void 0 : navigator.locks;
}
async function withWebStorageLock(name, operation, wait, waitMs) {
  const lockManager = webLockManager();
  if (!lockManager) return operation();
  const lockName = `yomu:${normalizedStorageLeaseName(name)}`;
  if (!countRealmWebLockRequest(lockName, 1)) wait?.blocked();
  try {
    return await requestWebLock(lockManager, lockName, () => {
      wait?.passed();
      return operation();
    }, waitMs);
  } finally {
    countRealmWebLockRequest(lockName, -1);
  }
}
function countRealmWebLockRequest(lockName, change) {
  const before = realmWebLockRequests.get(lockName) ?? 0;
  if (before + change > 0) realmWebLockRequests.set(lockName, before + change);
  else realmWebLockRequests.delete(lockName);
  return before;
}
async function requestWebLock(locks, name, operation, waitMs) {
  if (waitMs === void 0) return locks.request(name, {}, operation);
  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), waitMs);
  let granted = false;
  try {
    return await locks.request(name, { signal: giveUp.signal }, () => {
      granted = true;
      clearTimeout(timer);
      return operation();
    });
  } catch (error) {
    if (granted) throw error;
    return operation();
  } finally {
    clearTimeout(timer);
  }
}
function isPlainRecord2(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function createStorageCoordinationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function debugStorageLeaseError(message, key, error) {
  if (typeof console !== "undefined") console.debug("[Yomu] Storage", message, { key, error });
}

// src/reader/app/managed-storage-backup-policy.ts
var EXCLUDED_BACKUP_STORAGE_KEYS = /* @__PURE__ */ new Set([
  "yomu:factory-reset-signal",
  MANAGED_STATE_EPOCH_KEY,
  "yomu:local-storage-provenance:v1",
  // Transient cloud-sync handoff written before an OAuth redirect. Factory
  // reset owns it via the '__yomu' prefix, but backups must not replay it.
  "__yomu_cloud_settings_sync_pending_action"
]);
function isManagedStorageBackupKey(key) {
  return isManagedStorageKey(key) && !isPrivateManagedStorageKey(key) && !isManagedStorageSlotKey(key) && !key.startsWith(MANAGED_STATE_EPOCH_LEASE_KEY_PREFIX) && !key.startsWith(STORAGE_LEASE_KEY_PREFIX) && !EXCLUDED_BACKUP_STORAGE_KEYS.has(key);
}

// src/reader/app/storage-local-values.ts
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
function webStorageHasKey(storage, key) {
  try {
    return storage.getItem(key) !== null;
  } catch {
    return false;
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

// src/reader/settings/settings-authority-storage-keys.ts
var SETTINGS_STORAGE_KEY = "jpdb-popup-reader-settings";
var RETIRED_SETTINGS_STORAGE_KEYS = [
  "jpdb-reader-settings",
  "yomu-reader-settings",
  "yomu-settings",
  "yomu:explicit-user-settings:v1"
];
var SETTINGS_INTENT_LEDGER_STORAGE_KEY = "yomu:settings-intent:v2";
var PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY = "yomu:prefer-japanese-site-language:v1";
var PREFERRED_JAPANESE_SITE_LANGUAGE_CACHE_KEY = "yomu:prefer-japanese-site-language";
var SETTINGS_AUTHORITY_STORAGE_KEYS = /* @__PURE__ */ new Set([
  SETTINGS_STORAGE_KEY,
  ...RETIRED_SETTINGS_STORAGE_KEYS,
  SETTINGS_INTENT_LEDGER_STORAGE_KEY,
  PREFERRED_JAPANESE_SITE_LANGUAGE_STORAGE_KEY,
  PREFERRED_JAPANESE_SITE_LANGUAGE_CACHE_KEY
]);
function isSettingsAuthorityStorageKey(key) {
  return SETTINGS_AUTHORITY_STORAGE_KEYS.has(key);
}

// src/reader/app/hosted-demo-settings.ts
var HOSTED_LOCAL_SETTINGS_KEYS = [
  "showFurigana",
  "furiganaMode",
  "showPitchAccent",
  "wordUnderlineColorSource",
  "subtitlePlayerEnabled",
  "subtitleAutoDetect",
  "subtitleOverlayVisible",
  "subtitleControlsMode",
  "subtitleTranscriptVisible",
  "ocrEnabled",
  "ocrVideoPauseFrames",
  "ocrProvider",
  "ocrOverlayTheme",
  "preferJapaneseSiteLanguage"
];
var HOSTED_DEMO_READER_SETTINGS = {
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
  ocrOverlayTheme: "auto",
  preferJapaneseSiteLanguage: false
};

// src/reader/settings/passive-hosted-settings-record.ts
var ACADEMY_READER_DEFAULTS = {
  showFurigana: true,
  furiganaMode: "all",
  showPitchAccent: true
};
var HOSTED_APPEARANCE_CHOICES = {
  interfaceLanguage: /* @__PURE__ */ new Set(["auto", "en", "ja"]),
  theme: /* @__PURE__ */ new Set(["auto", "dark", "light"])
};
var HOSTED_ACCENT_COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/iu;
function isPassiveHostedSettingsRecord(record2) {
  const entries2 = Object.entries(record2).filter(([key, value]) => key !== "learningTargetChosen" || value !== false);
  return entries2.every(isHostedAppearanceEntry) || extendsHostedPolicy(record2, entries2, ACADEMY_READER_DEFAULTS) || extendsHostedPolicy(record2, entries2, HOSTED_DEMO_READER_SETTINGS);
}
function isPassiveHostedSettingsJson(serialized) {
  let record2;
  try {
    record2 = JSON.parse(serialized);
  } catch {
    return false;
  }
  return typeof record2 === "object" && record2 !== null && !Array.isArray(record2) && isPassiveHostedSettingsRecord(record2);
}
function extendsHostedPolicy(record2, entries2, policy) {
  return Object.entries(policy).every(([key, value]) => record2[key] === value) && entries2.every((entry) => Object.hasOwn(policy, entry[0]) || isHostedAppearanceEntry(entry));
}
function isHostedAppearanceEntry([key, value]) {
  if (key === "accentColor") return typeof value === "string" && HOSTED_ACCENT_COLOR_RE.test(value);
  return Object.hasOwn(HOSTED_APPEARANCE_CHOICES, key) && HOSTED_APPEARANCE_CHOICES[key].has(value);
}

// src/reader/core/object-utils.ts
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/reader/app/local-mirror-provenance.ts
var PROVENANCE_KEY = "yomu:local-storage-provenance:v1";
var JAPANESE_SITE_LANGUAGE_KEY = "yomu:prefer-japanese-site-language:v1";
function captureLocalFallbackStoredState(key) {
  try {
    const serializedValue = localStorage.getItem(key);
    const entry = provenanceValues()[key];
    return {
      serializedValue,
      provenance: entry ? { ...entry } : null
    };
  } catch (error) {
    throw storageWriteError(key, "Local fallback read failed", error);
  }
}
function localFallbackStoredStatesMatch(left, right) {
  return Boolean(right && left.serializedValue === right.serializedValue && provenanceEntriesMatch(left.provenance, right.provenance));
}
function provenanceEntriesMatch(left, right) {
  return left === null ? right === null : right !== null && left.epoch === right.epoch && left.fingerprint === right.fingerprint;
}
function restoreLocalFallbackStoredState(key, state) {
  try {
    if (state.serializedValue === null) localStorage.removeItem(key);
    else localStorage.setItem(key, state.serializedValue);
    if (localStorage.getItem(key) !== state.serializedValue) throw new Error("read-back did not match");
  } catch (error) {
    throw storageWriteError(key, "Local fallback restore failed", error);
  }
  updateProvenance(key, state.provenance, true);
}
function writeLocalManagedValueOrThrow(key, value, epoch) {
  const previous = captureLocalFallbackStoredState(key);
  try {
    const serialized = localStorageSetOrThrow(key, value);
    updateProvenance(key, {
      epoch: managedStateEpochToken(epoch),
      fingerprint: fingerprint(serialized)
    }, true);
  } catch (error) {
    try {
      restoreLocalFallbackStoredState(key, previous);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Local fallback publication and rollback failed for "${key}".`
      );
    }
    throw error;
  }
}
function removeLocalManagedValue(key) {
  removeLocalStorageKey(key);
  removeSessionStorageKey(key);
  updateProvenance(key, null);
}
function restoreLocalFallbackStoredValueAtEpoch(key, value, existed, epoch) {
  if (!existed) return removeLocalManagedValue(key);
  if (!epoch) throw storageWriteError(key, "Managed storage cannot restore its localStorage fallback");
  writeLocalManagedValueOrThrow(key, value, epoch);
}
function localMirrorBelongsToEpoch(key, epoch) {
  const serialized = recoverableSerializedValue(key);
  if (serialized === null) return false;
  const entry = provenanceValues()[key];
  return entry ? entry.epoch === managedStateEpochToken(epoch) && entry.fingerprint === fingerprint(serialized) : epoch.generation === 0;
}
function localMirrorEpochMatches(key, epoch, rawWriterRecord) {
  const serialized = recoverableSerializedValue(key);
  if (serialized === null) return false;
  const entry = provenanceValues()[key];
  if (entry) return entry.epoch === managedStateEpochToken(epoch);
  return epoch.generation === 0 || rawWriterRecord(serialized);
}
function updateProvenance(key, entry, strict = false) {
  const values = provenanceValues();
  if (!mutateProvenance(values, key, entry)) return;
  persistProvenance(values, strict);
}
function mutateProvenance(values, key, entry) {
  if (entry) {
    values[key] = entry;
    return true;
  }
  if (!(key in values)) return false;
  delete values[key];
  return true;
}
function persistProvenance(values, strict) {
  if (Object.keys(values).length) {
    const value = { version: 1, values };
    if (strict) localStorageSetOrThrow(PROVENANCE_KEY, value);
    else localStorageSet(PROVENANCE_KEY, value);
    return;
  }
  removeLocalStorageKey(PROVENANCE_KEY);
}
function provenanceValues() {
  const stored = localStorageGet(PROVENANCE_KEY, null);
  if (!isStoredProvenance(stored)) return {};
  const values = {};
  for (const [key, value] of Object.entries(stored.values)) {
    const normalized = normalizedEntry(value);
    if (normalized) values[key] = normalized;
  }
  return values;
}
function isStoredProvenance(value) {
  if (!isRecord(value) || value.version !== 1) return false;
  return isRecord(value.values);
}
function normalizedEntry(value) {
  if (!isRecord(value)) return null;
  if (typeof value.epoch !== "string") return null;
  if (typeof value.fingerprint !== "string") return null;
  return { epoch: value.epoch, fingerprint: value.fingerprint };
}
function recoverableSerializedValue(key) {
  if (key === JAPANESE_SITE_LANGUAGE_KEY) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function fingerprint(serialized) {
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index++) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 16777619);
  }
  return `${serialized.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

// src/reader/app/website-store-adoption.ts
var SETTINGS_KEY = "jpdb-popup-reader-settings";
var INTENT_LEDGER_KEY = "yomu:settings-intent:v2";
var LOCAL_SRS_V2_INDEX_KEY = "yomu:srs-local:v2:index";
var LAST_KEYS = [LOCAL_SRS_V2_INDEX_KEY, "yomu:prefer-japanese-site-language:v1", INTENT_LEDGER_KEY, SETTINGS_KEY];
var COORDINATION_FIELDS = ["__yomuSettingsPersistenceTransactionV1", "__yomuSettingsPersistenceCommitV1"];
var HOSTED_PATCH_FIELD = "__yomuHostedPendingGmPatch";
var OWNER_NAMESPACE_PREFIX = "yomu:web-owner:v2:";
var adoption;
function websiteOnlyValuePresent(key, epoch) {
  return isHostedYomuOrigin() && isWebsiteStoreKey(key) && localMirrorBelongsToEpoch(key, epoch);
}
function adoptWebsiteOnlyStore(getValue, epoch, write) {
  const token = managedStateEpochToken(epoch);
  if (adoption?.token === token) return adoption.done;
  const done = runAdoption(getValue, epoch, write).finally(() => {
    if (adoption?.done === done) adoption = void 0;
  });
  adoption = { token, done };
  return done;
}
async function runAdoption(getValue, epoch, write) {
  if (!isHostedYomuOrigin()) return;
  const installed = await readManagedGmValue(getValue, SETTINGS_KEY, epoch);
  const ledger = await readManagedGmValue(getValue, INTENT_LEDGER_KEY, epoch);
  if (installed.kind === "found" && !saysNoTargetChosen(installed.value) && recordsChoices(ledger)) return;
  const settingsUnitAbsent = installed.kind === "missing" && ledger.kind === "missing";
  for (const key of websiteOnlyKeys(epoch)) {
    if (isSettingsAuthorityStorageKey(key) && !settingsUnitAbsent) continue;
    if ((await readManagedGmValue(getValue, key, epoch)).kind !== "missing") continue;
    const value = localStorageGet(key, MISSING);
    if (!isMissingSentinel(value)) await write(key, adoptedValue(key, value));
  }
}
function websiteOnlyKeys(epoch) {
  const keys = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key && websiteOnlyValuePresent(key, epoch)) keys.push(key);
  }
  const rank = (key) => LAST_KEYS.indexOf(key);
  return keys.sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}
function isWebsiteStoreKey(key) {
  return isManagedStorageBackupKey(key) && !key.startsWith(OWNER_NAMESPACE_PREFIX) && !RETIRED_SETTINGS_STORAGE_KEYS.includes(key) && managedStateEntries().some((entry) => entry.kind === "gm" && (entry.key === key || entry.prefix !== void 0 && key.startsWith(entry.prefix)));
}
function adoptedValue(key, value) {
  if (!isRecord(value)) return value;
  const record2 = withoutFields(value, COORDINATION_FIELDS);
  if (key === SETTINGS_KEY) return withoutFields(record2, [HOSTED_PATCH_FIELD, ...HOSTED_LOCAL_SETTINGS_KEYS]);
  if (key === INTENT_LEDGER_KEY && isRecord(record2.records)) {
    return { ...record2, records: withoutFields(record2.records, HOSTED_LOCAL_SETTINGS_KEYS) };
  }
  return record2;
}
function withoutFields(record2, fields) {
  const copy = { ...record2 };
  for (const field of fields) delete copy[field];
  return copy;
}
function saysNoTargetChosen(settings) {
  return isRecord(settings) && settings.learningTargetChosen === false;
}
function recordsChoices(ledger) {
  if (ledger.kind !== "found" || !isRecord(ledger.value)) return false;
  const records = ledger.value.records;
  return isRecord(records) && Object.keys(records).length > 0;
}

// src/reader/app/managed-write-journal.ts
var ConcreteManagedWriteJournal = class {
  constructor(storage, preserveLocalFallbackOnWriteFailure) {
    this.storage = storage;
    this.preserveLocalFallbackOnWriteFailure = preserveLocalFallbackOnWriteFailure;
  }
  receipts = /* @__PURE__ */ new Map();
  active = [];
  open = true;
  async capture(key) {
    const existing = this.receipts.get(key);
    if (existing) return existing;
    const previous = await this.storage.readAuthority(key);
    const observedLocal = shouldTrackExactLocalFallback(key) ? captureLocalFallbackStoredState(key) : void 0;
    const receipt = {
      key,
      previous,
      authorityTarget: previous,
      localTarget: observedLocal ? previous : { existed: false, value: null },
      localBefore: observedLocal,
      stagedAuthority: [],
      stagedLocal: [],
      interrupted: false,
      restoreCapturedLocal: true,
      active: false
    };
    this.receipts.set(key, receipt);
    return receipt;
  }
  adoptInterrupted(receipt, previous, localPrevious = previous) {
    const record2 = receipt;
    record2.authorityTarget = previous;
    record2.localTarget = localPrevious;
    record2.interrupted = true;
    record2.restoreCapturedLocal = Boolean(record2.localBefore && record2.localBefore.serializedValue !== (record2.previous.existed ? JSON.stringify(record2.previous.value) : null));
    if (record2.localBefore) rememberLocalStage(record2, record2.localBefore, record2.previous);
    this.activate(record2);
  }
  async write(receipt, value) {
    const record2 = receipt;
    this.activate(record2);
    const attempted = { existed: true, value };
    record2.stagedAuthority.push(value);
    try {
      await this.storage.writeAuthority(
        record2.key,
        value,
        this.preserveLocalFallbackOnWriteFailure
      );
    } finally {
      if (record2.localBefore) {
        rememberLocalStage(record2, captureLocalFallbackStoredState(record2.key), attempted);
      }
    }
  }
  async restore(receipt, message) {
    const record2 = receipt;
    this.activate(record2);
    const errors = await rollbackManagedWrite(
      this.storage,
      record2,
      this.preserveLocalFallbackOnWriteFailure
    );
    if (errors.length) throw new AggregateError(errors, message);
  }
  commit() {
    this.open = false;
  }
  async rollback(message, stopOnError = false) {
    if (!this.open) return;
    this.open = false;
    const errors = await rollbackManagedWrites(
      this.storage,
      this.active,
      stopOnError,
      this.preserveLocalFallbackOnWriteFailure
    );
    if (errors.length) throw new AggregateError(errors, `${message} for ${errors.length} operation(s).`);
  }
  async reject(error, message, stopOnError = false) {
    if (!this.open) throw error;
    this.open = false;
    const rollbackErrors = await rollbackManagedWrites(
      this.storage,
      this.active,
      stopOnError,
      this.preserveLocalFallbackOnWriteFailure
    );
    if (!rollbackErrors.length) throw error;
    throw new AggregateError(
      [error, ...rollbackErrors],
      `${message} and ${rollbackErrors.length} rollback operation(s) also failed.`
    );
  }
  activate(receipt) {
    if (!this.open) throw new Error("Managed storage write journal is already closed.");
    if (receipt.active) return;
    receipt.active = true;
    this.active.push(receipt);
  }
};
function createConcreteManagedWriteJournal(storage, preserveLocalFallbackOnWriteFailure = false) {
  return new ConcreteManagedWriteJournal(storage, preserveLocalFallbackOnWriteFailure);
}
async function rollbackManagedWrites(storage, receipts, stopOnError, forceAuthorityRestore) {
  const errors = [];
  let authorityStopped = false;
  for (let index = receipts.length - 1; index >= 0; index--) {
    if (authorityStopped) {
      const receipt = receipts[index];
      if (receipt.restoreCapturedLocal) {
        const local = captureManagedWriteLocal(receipt, errors);
        rollbackManagedWriteLocal(storage, receipt, local, errors);
      }
      continue;
    }
    const current = await rollbackManagedWrite(storage, receipts[index], forceAuthorityRestore);
    errors.push(...current);
    if (stopOnError && current.length) authorityStopped = true;
  }
  return errors;
}
async function rollbackManagedWrite(storage, receipt, forceAuthorityRestore) {
  const errors = [];
  await rollbackManagedWriteAuthority(storage, receipt, forceAuthorityRestore, errors);
  const currentLocal = captureManagedWriteLocal(receipt, errors);
  rollbackManagedWriteLocal(storage, receipt, currentLocal, errors);
  return errors;
}
function captureManagedWriteLocal(receipt, errors) {
  if (!receipt.localBefore) return void 0;
  try {
    return captureLocalFallbackStoredState(receipt.key);
  } catch (error) {
    errors.push(error);
    return void 0;
  }
}
async function rollbackManagedWriteAuthority(storage, receipt, forceAuthorityRestore, errors) {
  const current = await readRollbackAuthority(storage, receipt.key, errors);
  if (!current) return;
  if (!authorityRestoreIsRequired(receipt, current, forceAuthorityRestore)) return;
  if (!authorityRollbackIsSafe(receipt, current)) {
    errors.push(managedWriteConflict(receipt.key, "Managed storage value"));
    return;
  }
  await restoreRollbackAuthority(storage, receipt, errors);
}
function authorityRestoreIsRequired(receipt, current, forceAuthorityRestore) {
  return forceAuthorityRestore || !managedStoredValueStatesMatch(current, receipt.authorityTarget);
}
function authorityRollbackIsSafe(receipt, current) {
  return managedStoredValueStatesMatch(current, receipt.authorityTarget) || authorityWasStaged(receipt, current);
}
async function readRollbackAuthority(storage, key, errors) {
  try {
    return await storage.readAuthority(key);
  } catch (error) {
    errors.push(error);
    return void 0;
  }
}
async function restoreRollbackAuthority(storage, receipt, errors) {
  try {
    await storage.restoreAuthority(receipt.key, receipt.authorityTarget);
  } catch (error) {
    errors.push(error);
  }
}
function rollbackManagedWriteLocal(storage, receipt, current, errors) {
  try {
    restoreManagedWriteLocal(storage, receipt, current);
  } catch (error) {
    errors.push(error);
  }
}
function restoreManagedWriteLocal(storage, receipt, current) {
  if (!receipt.localBefore) return restoreUntrackedWriteLocal(storage, receipt);
  if (!current) return;
  assertLocalStateCanRollback(storage, receipt, current);
  if (receipt.restoreCapturedLocal) return restoreLocalFallbackStoredState(receipt.key, receipt.localBefore);
  storage.restoreLocalTarget(receipt.key, receipt.localTarget);
}
function restoreUntrackedWriteLocal(storage, receipt) {
  if (!receipt.interrupted) storage.restoreLocalTarget(receipt.key, receipt.localTarget);
}
function assertLocalStateCanRollback(storage, receipt, current) {
  if (localStateCanRollback(storage, receipt, current)) return;
  throw managedWriteConflict(receipt.key, "Local fallback value");
}
function localStateCanRollback(storage, receipt, current) {
  if (localStateWasCaptured(receipt, current)) return true;
  return receipt.interrupted && managedStoredValueStatesMatch(storage.readLocalTarget(receipt.key), receipt.localTarget);
}
function localStateWasCaptured(receipt, current) {
  return Boolean(receipt.localBefore && localFallbackStoredStatesMatch(current, receipt.localBefore)) || receipt.stagedLocal.some((state) => localFallbackStoredStatesMatch(current, state));
}
function authorityWasStaged(receipt, current) {
  if (managedStoredValueStatesMatch(current, receipt.previous)) return true;
  return current.existed && receipt.stagedAuthority.some((value) => managedStoredValuesMatch(current.value, value));
}
function rememberLocalStage(receipt, local, authority) {
  if (!rawLocalStateRepresentsAuthority(local, authority)) return;
  if (!receipt.stagedLocal.some((item) => localFallbackStoredStatesMatch(item, local))) {
    receipt.stagedLocal.push(local);
  }
}
function rawLocalStateRepresentsAuthority(local, authority) {
  if (!authority.existed) return local.serializedValue === null;
  if (local.serializedValue === null) return false;
  try {
    return managedStoredValuesMatch(JSON.parse(local.serializedValue), authority.value);
  } catch {
    return false;
  }
}
function shouldTrackExactLocalFallback(key) {
  return !isSettingsAuthorityStorageKey(key) || isHostedYomuOrigin();
}
function managedStoredValueStatesMatch(left, right) {
  return left.existed === right.existed && (!left.existed || managedStoredValuesMatch(left.value, right.value));
}
function managedStoredValuesMatch(left, right) {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
function managedWriteConflict(key, label) {
  return new Error(`${label} "${key}" changed after staging; rollback left the newer value intact.`);
}

// src/reader/app/gm-storage-adapters.ts
function asyncGmGetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  const direct = directGmGetValue();
  if (direct) return direct;
  const bridge = getUserscriptGmStorage();
  return bridge ? (key, fallback) => bridge.getValue(key, fallback) : null;
}
function directGmGetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  return modernGmGetValue() ?? legacyGmGetValue() ?? rawExtensionStorageGetValue();
}
function legacyGmGetValue() {
  return typeof GM_getValue === "function" ? GM_getValue : null;
}
function modernGmGetValue() {
  const gm = userscriptGmApi();
  return typeof gm?.getValue === "function" ? gm.getValue.bind(gm) : null;
}
function asyncGmSetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  const direct = directGmSetValue();
  if (direct) return direct;
  if (directGmGetValue()) return null;
  return bridgeGmSetValue();
}
function directGmSetValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  return legacyGmSetValue() ?? modernGmSetValue() ?? extensionGmSetValue();
}
function legacyGmSetValue() {
  return typeof GM_setValue === "function" ? GM_setValue : null;
}
function modernGmSetValue() {
  const gm = userscriptGmApi();
  return typeof gm?.setValue === "function" ? gm.setValue.bind(gm) : null;
}
function extensionGmSetValue() {
  const extension = extensionStorageArea();
  return extension ? (key, value) => extension.set({ [key]: value }) : null;
}
function bridgeGmSetValue() {
  const bridge = getUserscriptGmStorage();
  return bridge ? (key, value) => bridge.setValue(key, value) : null;
}
function asyncGmDeleteValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  const direct = directGmDeleteValue();
  if (direct) return direct;
  if (directGmGetValue()) return null;
  return bridgeGmDeleteValue();
}
function directGmDeleteValue() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  return legacyGmDeleteValue() ?? modernGmDeleteValue() ?? extensionGmDeleteValue();
}
function legacyGmDeleteValue() {
  return typeof GM_deleteValue === "function" ? GM_deleteValue : null;
}
function modernGmDeleteValue() {
  const gm = userscriptGmApi();
  return typeof gm?.deleteValue === "function" ? gm.deleteValue.bind(gm) : null;
}
function extensionGmDeleteValue() {
  const extension = extensionStorageArea();
  return extension ? (key) => extension.remove(key) : null;
}
function bridgeGmDeleteValue() {
  const bridge = getUserscriptGmStorage();
  return bridge ? (key) => bridge.deleteValue(key) : null;
}
function asyncGmListValues() {
  if (packagedExtensionStorageAdapterMissing()) return null;
  const direct = directGmListValues();
  if (direct) return direct;
  if (directGmGetValue()) return null;
  return bridgeGmListValues();
}
function directGmListValues() {
  return modernGmListValues() ?? legacyGmListValues() ?? extensionGmListValues();
}
function legacyGmListValues() {
  if (typeof GM_listValues === "function") return GM_listValues;
  const directListValues = globalThis.GM_listValues;
  return typeof directListValues === "function" ? directListValues : null;
}
function modernGmListValues() {
  const gm = userscriptGmApi();
  return typeof gm?.listValues === "function" ? gm.listValues.bind(gm) : null;
}
function extensionGmListValues() {
  const extension = extensionStorageArea();
  if (!extension) return null;
  return async () => extension.getKeys ? extension.getKeys() : Object.keys(await extension.get(null));
}
function bridgeGmListValues() {
  const bridge = getUserscriptGmStorage();
  return bridge ? () => bridge.listValues() : null;
}
function extensionStorageArea() {
  return extensionCapability((extension) => extension.storage?.local);
}
function extensionCapability(select) {
  const candidate = globalThis;
  return activeExtensionCapability(candidate.browser, select) ?? activeExtensionCapability(candidate.chrome, select) ?? null;
}
function activeExtensionCapability(extension, select) {
  return extension?.runtime?.id && extensionRuntimeMayBeYomu() ? select(extension) : void 0;
}
function packagedExtensionStorageAdapterMissing() {
  if (!isPackagedExtensionDocument()) return false;
  const runtimeInstalled = globalThis.__YOMU_EXTENSION_STUDY_STORAGE_RUNTIME__ === true;
  return !runtimeInstalled || typeof GM_getValue !== "function" || typeof GM_setValue !== "function";
}
function isPackagedExtensionDocument() {
  try {
    const protocol = globalThis.location?.protocol ?? "";
    return /^(?:chrome|moz|safari-web)-extension:$/.test(protocol);
  } catch {
    return false;
  }
}
function rawExtensionStorageGetValue() {
  const extension = extensionStorageArea();
  return extension ? extensionStorageGetValue(extension) : null;
}
function extensionStorageGetValue(extension) {
  return async (key, fallback) => {
    const value = (await extension.get(key))[key];
    return value === void 0 ? fallback : value;
  };
}

// src/reader/app/storage.ts
var FACTORY_RESET_SIGNAL_KEY = "yomu:factory-reset-signal";
var managedStateEpochSession = managedStateEpochSessionForRealm();
async function assertRealmManagedStateEpoch(getValue) {
  const readEpoch = getValue ? async () => {
    const epoch2 = await authoritativeManagedStateEpoch(getValue);
    return epoch2.generation === 0 ? void 0 : epoch2;
  } : async () => localStorageGet(MANAGED_STATE_EPOCH_KEY, void 0);
  const epoch = await managedStateEpochSession.assertCurrent(readEpoch);
  return epoch;
}
async function writeManagedGmValue(key, value, epoch, getValue, setValue) {
  await assertManagedStateMutationFence(getValue, epoch);
  const stored = managedStateStoredValue(value, epoch);
  const storageKey = managedStateStorageKey(key, epoch);
  fenceStorageLeaseWrite(key);
  await setValue(storageKey, stored);
  await assertManagedStateMutationFence(getValue, epoch);
}
async function deleteManagedGmValue(key, epoch, getValue, setValue, deleteValue) {
  const storageKey = managedStateStorageKey(key, epoch);
  if (managedStateWritesSuppressed()) {
    if (!deleteValue) throw new Error("Managed storage cannot delete its value during factory reset.");
    await deleteValue(storageKey);
    if (storageKey !== key) await deleteValue(key);
    await assertRealmManagedStateEpoch(getValue);
    return;
  }
  fenceStorageLeaseWrite(key);
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
  if (isPromiseLike(stored)) {
    void Promise.resolve(stored).catch((error) => debugStorageError("Synchronous epoch probe could not read async storage", MANAGED_STATE_EPOCH_KEY, error));
    return null;
  }
  const shared = parseManagedStateEpoch(isMissingSentinel(stored) ? void 0 : stored);
  managedStateEpochSession.assertCurrentSync(shared.generation === 0 ? void 0 : shared);
  return shared;
}
function managedStateEpochForSynchronousLocalRead() {
  try {
    const getValue = typeof GM_getValue === "function" ? GM_getValue : null;
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
function hasAsyncGmStorageBackend() {
  return asyncGmGetValue() !== null;
}
function localFallbackStoredValue(key, fallback) {
  const epoch = managedStateEpochForSynchronousLocalRead();
  if (!epoch || !localMirrorBelongsToEpoch(key, epoch)) return fallback;
  return localStorageGet(key, fallback);
}
async function gmStorageGetStrict(key, fallback) {
  const getValue = asyncGmGetValue();
  if (!getValue) {
    if (packagedExtensionStorageAdapterMissing()) return fallback;
    return localOnlyManagedValueStrict(key, fallback, await assertRealmManagedStateEpoch(null));
  }
  const epoch = await assertRealmManagedStateEpoch(getValue);
  return sharedManagedValue(getValue, key, fallback, epoch);
}
async function gmStorageGetSharedStrict(key, fallback) {
  const getValue = asyncGmGetValue();
  if (!getValue) return fallback;
  const epoch = await assertRealmManagedStateEpoch(getValue);
  return managedGmValue(getValue, key, fallback, epoch);
}
async function sharedManagedValue(getValue, key, fallback, epoch) {
  const read = await readManagedGmValue(getValue, key, epoch);
  if (read.kind === "found") return read.value;
  if (read.kind === "deleted" || !websiteOnlyValuePresent(key, epoch)) return fallback;
  await adoptWebsiteOnlyStore(getValue, epoch, gmStorageSet).catch((error) => debugStorageError("Website-only store adoption failed", key, error));
  const adopted = await readManagedGmValue(getValue, key, epoch);
  return adopted.kind === "found" ? adopted.value : fallback;
}
function localOnlyManagedValue(key, fallback, epoch) {
  const local = localMirrorBelongsToEpoch(key, epoch) ? localStorageGet(key, MISSING) : MISSING;
  if (!isMissingSentinel(local)) return local;
  return fallback;
}
function localOnlyManagedValueStrict(key, fallback, epoch) {
  if (!hostedSettingsLocalValuePresent(key)) return localOnlyManagedValue(key, fallback, epoch);
  if (!localMirrorEpochMatches(key, epoch, isPassiveHostedSettingsJson)) {
    throw storageWriteError(key, "Hosted settings localStorage is present without matching provenance");
  }
  return localStorageGet(key, fallback);
}
function hostedSettingsLocalValuePresent(key) {
  return isHostedSettingsStorageKey(key) && isHostedYomuOrigin() && webStorageHasKey(localStorage, key);
}
async function withGmStorageLease(name, operation, options = {}) {
  return withGmStorageLeaseCore(name, operation, options, {
    backend: gmStorageLeaseBackend(),
    captureEpoch: assertRealmManagedStateEpoch,
    assertMutationFence: assertManagedStateMutationFence,
    epochToken: managedStateEpochToken,
    hostedOrigin: isHostedYomuOrigin()
  });
}
function gmStorageLeaseBackend() {
  return {
    getValue: asyncGmGetValue(),
    setValue: asyncGmSetValue(),
    deleteValue: asyncGmDeleteValue(),
    listValues: asyncGmListValues()
  };
}
async function gmStorageSet(key, value) {
  if (managedStateWritesSuppressed()) throw new Error("Managed state writes are suppressed during factory reset.");
  const getValue = asyncGmGetValue();
  const setValue = asyncGmSetValue();
  if (setValue) return setSharedManagedValue(key, value, getValue, setValue);
  if (getValue) throw storageWriteError(key, "Installed storage has no writer");
  if (packagedExtensionStorageAdapterMissing()) {
    throw storageWriteError(key, "Packaged Study storage adapter is unavailable");
  }
  const epoch = await assertRealmManagedStateEpoch(null);
  writeLocalManagedValueOrThrow(key, value, epoch);
}
async function setSharedManagedValue(key, value, getValue, setValue) {
  let epoch;
  try {
    if (!getValue) throw new Error("Managed storage cannot validate its state epoch.");
    epoch = await assertRealmManagedStateEpoch(getValue);
    await writeManagedGmValue(key, value, epoch, getValue, setValue);
  } catch (error) {
    if (isStaleManagedStateEpochError(error) || isStorageLeaseLapsed(error)) throw error;
    throw storageWriteError(key, "GM storage write failed", error);
  }
}
var MANAGED_WRITE_STORAGE = {
  readAuthority: readManagedStoredValueAuthority,
  writeAuthority: (key, value) => gmStorageSet(key, value),
  restoreAuthority: (key, target) => restoreManagedStoredValueAuthority(key, target.value, target.existed),
  readLocalTarget: (key) => managedStoredValueState(localFallbackStoredValue(key, MISSING)),
  restoreLocalTarget: (key, target) => restoreLocalFallbackStoredValue(key, target.value, target.existed)
};
function createManagedWriteJournal(preserveLocalFallbackOnWriteFailure = false) {
  return createConcreteManagedWriteJournal(
    MANAGED_WRITE_STORAGE,
    preserveLocalFallbackOnWriteFailure
  );
}
async function readManagedStoredValueAuthority(key) {
  if (isSettingsAuthorityStorageKey(key)) {
    const value2 = isHostedYomuOrigin() ? await gmStorageGetStrict(key, MISSING) : await gmStorageGetSharedStrict(key, MISSING);
    return managedStoredValueState(value2);
  }
  const getValue = asyncGmGetValue();
  const epoch = await assertRealmManagedStateEpoch(getValue);
  const value = getValue ? await managedGmValue(getValue, key, MISSING, epoch) : localOnlyManagedValue(key, MISSING, epoch);
  return managedStoredValueState(value);
}
function managedStoredValueState(value) {
  return {
    existed: !isMissingSentinel(value),
    value: isMissingSentinel(value) ? null : value
  };
}
async function restoreManagedStoredValueAuthority(key, previousValue, existed) {
  const getValue = asyncGmGetValue();
  if (!getValue) return;
  const epoch = await assertRealmManagedStateEpoch(getValue);
  if (existed) {
    const setValue = asyncGmSetValue();
    if (!setValue) throw storageWriteError(key, "Managed storage cannot restore its authoritative value");
    await writeManagedGmValue(key, previousValue, epoch, getValue, setValue);
    return;
  }
  await deleteManagedGmValue(
    key,
    epoch,
    getValue,
    asyncGmSetValue(),
    asyncGmDeleteValue()
  );
}
function restoreLocalFallbackStoredValue(key, value, existed) {
  if (managedStateWritesSuppressed()) return;
  restoreLocalFallbackStoredValueAtEpoch(key, value, existed, managedStateEpochForSynchronousLocalRead());
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
  if (managedStateWritesSuppressed()) throw new Error("Managed state writes are suppressed during factory reset.");
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

// src/reader/settings/values.ts
function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}
function objectRecord(value) {
  return value && typeof value === "object" ? value : null;
}

// src/reader/settings/intent-ledger.ts
var SETTINGS_INTENT_LEDGER_STORAGE_KEY2 = "yomu:settings-intent:v2";
function parseSettingsIntentLedger(value) {
  const record2 = objectRecord2(value);
  const records = record2 && objectRecord2(record2.records);
  if (!records || !nonNegativeNumber(record2.revision)) return null;
  const parsed = {};
  let revision = record2.revision;
  for (const [key, entry] of Object.entries(records)) {
    const item = objectRecord2(entry);
    if (!item || !nonNegativeNumber(item.seq)) return null;
    const seq = item.seq;
    parsed[key] = hasOwn(item, "value") ? { seq, value: item.value } : { seq };
    revision = Math.max(revision, seq);
  }
  return { revision, records: parsed };
}
function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function objectRecord2(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function recordSettingsIntent(ledger, keys, settings) {
  if (!keys.length) return ledger;
  const records = { ...ledger.records };
  let revision = ledger.revision;
  for (const key of keys) {
    if (!hasOwn(settings, key)) continue;
    const value = settings[key];
    records[key] = isSubstitutableSettingValue(value) ? { seq: ++revision, value } : { seq: ++revision };
  }
  return revision === ledger.revision ? ledger : { revision, records };
}
function applySettingsIntent(settings, ledger) {
  const keys = Object.keys(ledger.records);
  if (!keys.length) return settings;
  const next = { ...settings };
  let changed = false;
  for (const key of keys) {
    const record2 = ledger.records[key];
    if (!hasOwn(record2, "value") || !hasOwn(next, key)) continue;
    if (sameSettingsValue(next[key], record2.value)) continue;
    next[key] = record2.value;
    changed = true;
  }
  return changed ? next : settings;
}
function isSubstitutableSettingValue(value) {
  return value === null || value === void 0 || typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}
function sameSettingsValue(left, right) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

// src/reader/settings/settings-persistence-format.ts
var TRANSACTION_FIELD = "__yomuSettingsPersistenceTransactionV1";
var COMMIT_FIELD = "__yomuSettingsPersistenceCommitV1";
function committedSettingsStoragePair(storedSettings, storedIntentLedger) {
  const marker = transactionMarker(storedSettings);
  const { settings, intentLedger } = marker ? { settings: snapshotValue(marker.settings), intentLedger: snapshotValue(marker.intentLedger) } : { settings: storedSettings, intentLedger: storedIntentLedger };
  return matchingCommittedPair(settings, intentLedger);
}
function matchingCommittedPair(settings, intentLedger) {
  const settingsId = commitId(settings);
  return settingsId !== null && settingsId === commitId(intentLedger) ? { settings: withoutCommit(settings), intentLedger: withoutCommit(intentLedger) } : null;
}
function commitId(value) {
  const record2 = objectRecord(value);
  if (!record2) return void 0;
  return recordCommitId(record2);
}
function recordCommitId(record2) {
  if (!Object.hasOwn(record2, COMMIT_FIELD)) return void 0;
  const id = record2[COMMIT_FIELD];
  return typeof id === "string" && id ? id : null;
}
function withCommit(value, id) {
  return { ...value, [COMMIT_FIELD]: id };
}
function withoutCommit(value) {
  const record2 = objectRecord(value);
  if (!record2 || !Object.hasOwn(record2, COMMIT_FIELD)) return value;
  const clean = { ...record2 };
  delete clean[COMMIT_FIELD];
  return clean;
}
function transactionMarker(value) {
  const owner = objectRecord(value);
  const marker = owner && objectRecord(owner[TRANSACTION_FIELD]);
  if (!marker) return null;
  return validatedTransactionMarker(marker);
}
function validatedTransactionMarker(marker) {
  if (marker.version !== 1) return null;
  const settings = serializedSnapshot(marker.settings);
  const intentLedger = serializedSnapshot(marker.intentLedger);
  return settings && intentLedger ? { version: 1, settings, intentLedger } : null;
}
function serializedSnapshot(value) {
  const record2 = objectRecord(value);
  return record2 && typeof record2.existed === "boolean" && typeof record2.localFallbackExisted === "boolean" ? {
    existed: record2.existed,
    previousValue: record2.previousValue,
    localFallbackExisted: record2.localFallbackExisted,
    localFallbackValue: record2.localFallbackValue
  } : null;
}
function snapshotValue(snapshot) {
  return snapshot.existed ? snapshot.previousValue : null;
}

// src/reader/app/save-wait.ts
var listeners = /* @__PURE__ */ new Set();
var waits = 0;
function reportSaveWaitingForAnotherTab(waiting) {
  waits = Math.max(0, waits + (waiting ? 1 : -1));
  for (const listener of listeners) {
    try {
      listener(waits > 0);
    } catch {
    }
  }
}

// src/reader/settings/settings-persistence-transaction.ts
var SETTINGS_PERSISTENCE_STORAGE_LEASE = "reader-settings-persistence";
var SETTINGS_PERSISTENCE_LEASE_OPTIONS = {
  leaseMs: STORAGE_WORK_LEASE_MS,
  guards: isSettingsAuthorityStorageKey,
  onWait: reportSaveWaitingForAnotherTab
};
var TRANSACTION_FIELD2 = "__yomuSettingsPersistenceTransactionV1";
async function readSettingsPersistenceViewStrictFrom(read) {
  const view = await stableSettingsPersistenceView(read);
  if (view) return view;
  throw new Error("Settings storage did not provide a stable committed snapshot.");
}
async function stableSettingsPersistenceView(read) {
  for (let attempt2 = 0; attempt2 < 3; attempt2++) {
    const view = await sampledSettingsView(read);
    if (view) return view;
  }
  return null;
}
async function sampledSettingsView(read) {
  const beforeSettings = await read(SETTINGS_STORAGE_KEY, null);
  const beforeLedger = await read(SETTINGS_INTENT_LEDGER_STORAGE_KEY2, null);
  const afterLedger = await read(SETTINGS_INTENT_LEDGER_STORAGE_KEY2, null);
  const afterSettings = await read(SETTINGS_STORAGE_KEY, null);
  if (!sampleIsStable(beforeSettings, beforeLedger, afterSettings, afterLedger)) return null;
  const committed = committedSettingsStoragePair(afterSettings, afterLedger);
  if (!committed) return null;
  const intentLedger = committed.intentLedger == null ? { revision: 0, records: {} } : parseSettingsIntentLedger(committed.intentLedger);
  if (!intentLedger) return null;
  return {
    settings: committed.settings,
    intentLedger
  };
}
function sampleIsStable(beforeSettings, beforeLedger, afterSettings, afterLedger) {
  return valuesMatch(beforeSettings, afterSettings) && valuesMatch(beforeLedger, afterLedger);
}
async function persistSettingsStorageTransaction(nextIntentLedger, settings) {
  const journal = createManagedWriteJournal(true);
  const snapshots = await storageSnapshots(journal);
  try {
    const id = createStorageCoordinationId();
    await journal.write(snapshots.settings.receipt, transactionRecord(snapshots.settings, snapshots.intentLedger));
    await journal.write(snapshots.intentLedger.receipt, withCommit(nextIntentLedger, id));
    await journal.write(snapshots.settings.receipt, withCommit(settings, id));
    journal.commit();
  } catch (error) {
    await journal.reject(error, "Settings persistence failed", true);
  }
}
async function storageSnapshots(journal) {
  const settingsReceipt = await journal.capture(SETTINGS_STORAGE_KEY);
  const rawSettings = storageSnapshot(settingsReceipt);
  const marker = transactionMarker(rawSettings.previousValue);
  if (!marker) {
    return {
      settings: rawSettings,
      intentLedger: storageSnapshot(await journal.capture(SETTINGS_INTENT_LEDGER_STORAGE_KEY2))
    };
  }
  const intentReceipt = await journal.capture(SETTINGS_INTENT_LEDGER_STORAGE_KEY2);
  const settings = markerSnapshot(settingsReceipt, marker.settings);
  const intentLedger = markerSnapshot(intentReceipt, marker.intentLedger);
  journal.adoptInterrupted(
    settingsReceipt,
    authorityState(settings),
    localState(settings)
  );
  journal.adoptInterrupted(
    intentReceipt,
    authorityState(intentLedger),
    localState(intentLedger)
  );
  return { settings, intentLedger };
}
function storageSnapshot(receipt) {
  const { existed, value } = receipt.previous;
  return {
    receipt,
    existed,
    previousValue: value,
    // Raw page storage never enters the privileged crash marker.
    localFallbackExisted: existed,
    localFallbackValue: value
  };
}
function authorityState(snapshot) {
  return { existed: snapshot.existed, value: snapshot.previousValue };
}
function localState(snapshot) {
  return { existed: snapshot.localFallbackExisted, value: snapshot.localFallbackValue };
}
function transactionRecord(settings, intentLedger) {
  const previous = objectRecord3(settings.previousValue) ?? {};
  return {
    ...previous,
    [TRANSACTION_FIELD2]: {
      version: 1,
      settings: serializeSnapshot(settings),
      intentLedger: serializeSnapshot(intentLedger)
    }
  };
}
function serializeSnapshot(snapshot) {
  return {
    existed: snapshot.existed,
    previousValue: snapshot.previousValue,
    localFallbackExisted: snapshot.existed,
    localFallbackValue: snapshot.previousValue
  };
}
function markerSnapshot(receipt, snapshot) {
  return { receipt, ...snapshot };
}
function valuesMatch(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
function objectRecord3(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

// src/reader/settings/hosted-settings-provenance.ts
async function persistHostedSharedSettingsPatch(patch, userChoice) {
  await withGmStorageLease(SETTINGS_PERSISTENCE_STORAGE_LEASE, async () => {
    const read = hasAsyncGmStorageBackend() ? gmStorageGetSharedStrict : gmStorageGetStrict;
    const view = await readSettingsPersistenceViewStrictFrom(read);
    if (view.settings == null && !userChoice) return;
    const shared = view.settings ?? {};
    if (typeof shared !== "object" || Array.isArray(shared)) throw new Error("Invalid hosted settings authority.");
    const merged = { ...shared, ...patch };
    const ledger = recordSettingsIntent(view.intentLedger, userChoice ? Object.keys(patch) : [], merged);
    const settings = applySettingsIntent(merged, ledger);
    if (ledger === view.intentLedger && JSON.stringify(settings) === JSON.stringify(shared)) return;
    await persistSettingsStorageTransaction(ledger, settings);
  }, SETTINGS_PERSISTENCE_LEASE_OPTIONS);
}

// src/reader/settings/hosted-appearance-settings.ts
var pending = Promise.resolve();
async function saveHostedAppearance(choice) {
  if (!choice || typeof choice !== "object" || Object.keys(choice).some((key) => key !== "key" && key !== "value")) {
    throw new TypeError("Invalid appearance choice.");
  }
  const allowed = choice.key === "theme" ? ["auto", "dark", "light"] : choice.key === "interfaceLanguage" ? ["auto", "en", "ja"] : [];
  if (!allowed.includes(choice.value)) throw new TypeError("Invalid appearance choice.");
  const patch = { [choice.key]: choice.value };
  const operation = pending.then(() => persistHostedSharedSettingsPatch(patch, true));
  pending = operation.catch(() => void 0);
  await operation;
}
export {
  saveHostedAppearance
};
