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
      return factory.createPolicy?.("yomu-reader", { createHTML: (html) => html }) ?? null;
    } catch {
      return null;
    }
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
  const APP_NAME = "よむ";
  const SUPPORT_COPY = "よむ is a free userscript for popup lookup, JPDB mining, dictionaries, OCR, subtitles, and Anki.";
  const SUPPORT_COPY_EXTRA = "Donations are optional and help cover development, devices, services, maintenance, and API costs.";
  const ANKI_SOURCE_ID = "__anki__";
  initialWindowMethod("dispatchEvent");
  initialWindowMethod("addEventListener");
  initialWindowMethod("removeEventListener");
  function initialWindowMethod(key) {
    if (typeof window === "undefined") return void 0;
    return readMethod(window, key);
  }
  function readMethod(source, key) {
    const value = readProperty(source, key);
    return typeof value === "function" ? value : void 0;
  }
  function readProperty(source, key) {
    if (!source || typeof source !== "object" && typeof source !== "function") return void 0;
    try {
      return source[key];
    } catch {
      return void 0;
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
  function isAppleTouchBrowser() {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent ?? "";
    const platform = navigator.platform ?? "";
    return /iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" || /Mac/i.test(platform)) && (navigator.maxTouchPoints ?? 0) > 1 && (/Macintosh|Mac OS X/i.test(userAgent) || platform === "MacIntel");
  }
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
      featureStudy: "Study",
      featureStudyBody: "A built-in study page reviews your JPDB, Anki and Jiten cards in their exact order — learn kanji to unlock words, or turn kanji cards off in Settings.",
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
featureStudy	学習
featureStudyBody	内蔵の学習ページでJPDB・Anki・Jitenのカードを本来の順序で復習。漢字を学んで単語を解放、設定で漢字カードをオフにもできます。
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
    const metrics = structuredImageMetrics(record);
    return `${renderStructuredImageLink(record, dictionary, path, title, metrics)}${renderStructuredImageDescription(description)}`;
  }
  function renderStructuredImageLink(record, dictionary, path, title, metrics) {
    return `<span${renderStructuredImageAttributes(record, dictionary, path)}>${renderStructuredImageContainer(record, title, metrics)}<span class="gloss-image-link-text">Image</span></span>`;
  }
  function renderStructuredImageAttributes(record, dictionary, path) {
    return [
      ` class="gloss-image-link"`,
      dictionaryAttribute(dictionary),
      structuredImagePathAttribute(path),
      ...structuredImageStateAttributes(record),
      ...structuredImageOptionalAttributes(record)
    ].join("");
  }
  function structuredImagePathAttribute(path) {
    return path ? ` data-path="${escapeHtml(path)}"` : "";
  }
  function structuredImageStateAttributes(record) {
    return [
      ` data-image-load-state="unloaded"`,
      ` data-has-aspect-ratio="true"`,
      ` data-image-rendering="${escapeHtml(structuredImageRendering(record))}"`,
      ` data-appearance="${escapeHtml(String(record.appearance || "auto"))}"`,
      structuredImageBooleanAttribute(record, "background", true),
      structuredImageBooleanAttribute(record, "collapsed", false),
      structuredImageBooleanAttribute(record, "collapsible", true)
    ];
  }
  function structuredImageOptionalAttributes(record) {
    return [
      typeof record.verticalAlign === "string" ? ` data-vertical-align="${escapeHtml(record.verticalAlign)}"` : "",
      typeof record.sizeUnits === "string" ? ` data-size-units="${escapeHtml(record.sizeUnits)}"` : ""
    ];
  }
  function structuredImageBooleanAttribute(record, key, fallback) {
    const value = typeof record[key] === "boolean" ? record[key] : fallback;
    return ` data-${kebabCase(key)}="${value}"`;
  }
  function kebabCase(value) {
    return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
  }
  function renderStructuredImageContainer(record, title, metrics) {
    const containerTitle = title ? ` title="${escapeHtml(title)}"` : "";
    return `<span class="gloss-image-container" style="${escapeHtml(renderStructuredImageContainerStyle(record, metrics.usedWidth))}"${containerTitle}>${renderStructuredImageFrame(metrics)}</span>`;
  }
  function renderStructuredImageContainerStyle(record, usedWidth) {
    return [
      `width:${formatCssNumber(usedWidth)}em;`,
      typeof record.border === "string" ? `border:${record.border};` : "",
      typeof record.borderRadius === "string" ? `border-radius:${record.borderRadius};` : ""
    ].join("");
  }
  function renderStructuredImageFrame(metrics) {
    return `<span class="gloss-image-sizer" style="padding-top:${formatCssNumber(metrics.invAspectRatio * 100)}%;"></span><span class="gloss-image-background"></span><span class="gloss-image-container-overlay"></span>`;
  }
  function renderStructuredImageDescription(description) {
    return description ? `<span class="gloss-image-description">${escapeHtml(description)}</span>` : "";
  }
  function structuredImageDescription(record) {
    if (typeof record.description === "string") return record.description;
    return typeof record.alt === "string" ? record.alt : "";
  }
  function structuredImageMetrics(record) {
    const preferredWidth = numericRecordValue(record, "preferredWidth");
    const preferredHeight = numericRecordValue(record, "preferredHeight");
    const { width, height } = structuredImageNaturalSize(record, preferredWidth, preferredHeight);
    const invAspectRatio = height > 0 && width > 0 ? height / width : 1;
    const usedWidth = structuredImageUsedWidth(width, invAspectRatio, preferredWidth, preferredHeight);
    return { invAspectRatio, usedWidth };
  }
  function structuredImageNaturalSize(record, preferredWidth, preferredHeight) {
    return {
      width: preferredWidth ?? numericRecordValue(record, "width") ?? 100,
      height: preferredHeight ?? numericRecordValue(record, "height") ?? 100
    };
  }
  function structuredImageUsedWidth(width, invAspectRatio, preferredWidth, preferredHeight) {
    return preferredWidth ?? (preferredHeight ? preferredHeight / invAspectRatio : width);
  }
  function structuredImageRendering(record) {
    return String(record.imageRendering || (record.pixelated ? "pixelated" : "auto"));
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
  function numericRecordValue(record, key) {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function formatCssNumber(value) {
    return Number.isFinite(value) ? Number(value.toFixed(4)).toString() : "0";
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
  const ANKI_FIELD_ROLES = ["expression", "reading", "meaning", "sentence", "audio", "image"];
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
  function fieldNameForRole(fieldNames, role, mapping) {
    const mapped = mappedFieldName(fieldNames, mapping, role);
    if (mapped) return mapped;
    return suggestAnkiField(role, fieldNames, /* @__PURE__ */ new Set()).fieldName ?? "";
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
  function japaneseCharacterCount(value) {
    return (value.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) ?? []).length;
  }
  function normalizeAnkiFieldName(value) {
    return value.replace(/[_\s-]+/g, "").toLowerCase();
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
  function normalizeFieldValue(value) {
    return value.replace(/\s+/g, " ").trim();
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
  Logger.scope("Anki");
  Logger.scope("Anki");
  function buildYomuAnkiFields(card, sentence = "", context = {}) {
    const fieldContext = ankiFieldContext(context);
    const jpdbUrl = jpdbVocabularyUrl(card);
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
  function buildYomuAnkiPreviewFields(card, sentence, settings, context = {}, fieldTargetPlan) {
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
  function jpdbVocabularyUrl(card) {
    return card.source === "local" || card.source === "anki" ? "" : `https://jpdb.io/vocabulary/${card.vid}/${encodeURIComponent(card.spelling)}/${encodeURIComponent(card.reading)}`;
  }
  function renderCardStatus(card, language) {
    if (card.source === "local") return `<span class="yomu-chip">${escapeHtml$1(uiText(language, "ankiLocalDictionaryStatus"))}</span>`;
    if (card.source === "anki") return '<span class="yomu-chip">Anki</span>';
    return card.cardState.map((state) => `<span class="yomu-chip">${escapeHtml$1(state)}</span>`).join(" ");
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
  Object.fromEntries([
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
  function isMobileAnkiHandoffEnvironment() {
    const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
    return isAppleTouchBrowser() || /Android/i.test(userAgent) && /Chrome|Firefox|Firefox\/|FxiOS|EdgA/i.test(userAgent);
  }
  function canUseMobileAnkiHandoff(settings) {
    return settings.ankiEnabled && settings.ankiMobileHandoff && isMobileAnkiHandoffEnvironment();
  }
  function mobileAnkiHandoffAppName() {
    return isAndroidUserAgent() ? "AnkiDroid" : "AnkiMobile";
  }
  function isAndroidUserAgent() {
    return /Android/i.test(typeof navigator === "undefined" ? "" : navigator.userAgent);
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
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing" ${ankiDetailsStateAttributes(options, ANKI_SOURCE_ID, true)}>
            <summary class="jpdb-reader-local-title">
                <span><span class="jpdb-reader-state-dot anki-${aggregateState}"></span>Anki${notes.length > 1 ? ` (${notes.length})` : ""}</span>
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
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-anki-existing jpdb-reader-anki-new">
            <summary class="jpdb-reader-local-title">
                <span><span class="jpdb-reader-state-dot anki-not-in-deck"></span>Anki</span>
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
  function registerYomuCompanion(key, value) {
    const target = globalThis;
    target.__yomuCompanions = {
      ...target.__yomuCompanions ?? {},
      [key]: value
    };
  }
  registerYomuCompanion("anki", {
    renderAnkiActionRow,
    renderAnkiExistingSection,
    renderAnkiNewCardPreview,
    pruneRedundantAnkiGlyphRepeats,
    renderAnkiRenderedCardStudyBody,
    renderReviewButtons,
    reviewButtonGrades
  });
})();
