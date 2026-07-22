import { registerManagedStates, type ManagedStateEntry } from './managed-state-registry';

// The declared inventory of every Yomu-managed persistent store, sourced from a
// full grep of gmStorageSet/localStorage.setItem/sessionStorage.setItem/
// indexedDB.open across src/reader. Registered up front (imported by the storage
// layer) so the reset sweep and the invariant test share one list.
//
// A new store MUST add a row here (or call registerManagedState at its own
// definition site). factory-reset-invariant.test.ts fails when a yomu-* /
// jpdb-reader-* key survives a reset, which catches an unregistered store.
//
// Keys already covered by the managed-prefix sweep still appear here so the
// invariant test can seed and assert them, and so GM-only keys are cleared even
// when GM_listValues is unavailable (no prefix scan possible on that path).
const MANAGED_STATE_MANIFEST: readonly ManagedStateEntry[] = [
    // Settings (also legacy migration keys). The bunpro token / pill selections /
    // colours all live inside these settings objects.
    { owner: 'settings', kind: 'gm', key: 'jpdb-popup-reader-settings' },
    { owner: 'settings (legacy)', kind: 'gm', key: 'jpdb-reader-settings' },
    { owner: 'settings (legacy)', kind: 'gm', key: 'yomu-reader-settings' },
    { owner: 'settings (legacy)', kind: 'gm', key: 'yomu-settings' },

    // Cloud settings sync handoff written before an OAuth redirect.
    { owner: 'settings/dialog-controller', kind: 'gm', key: '__yomu_cloud_settings_sync_pending_action' },

    // App-level signals / flags / caches.
    { owner: 'app/storage', kind: 'gm', key: 'yomu:factory-reset-signal' },
    { owner: 'app/card-state-signal', kind: 'gm', key: 'yomu:card-state-signal' },
    { owner: 'app/storage leases', kind: 'gm', prefix: 'yomu:lease:' },
    { owner: 'srs/account-sync', kind: 'gm', key: 'yomu:private:academy-device:v1' },
    { owner: 'srs/account-sync', kind: 'gm', key: 'yomu:private:academy-device-pending:v1' },
    { owner: 'app/logger', kind: 'gm', key: 'yomu:enable-logs' },
    { owner: 'app/main', kind: 'gm', key: 'yomu:jpdb-review-examples-visible:v1' },
    { owner: 'app/preferred-site-language', kind: 'gm', key: 'yomu:prefer-japanese-site-language' },
    { owner: 'app/preferred-site-language', kind: 'session', key: 'yomu:jps' },
    { owner: 'app/preferred-site-language', kind: 'session', key: 'yomu:jps:hosts' },

    // Local no-account SRS deck.
    { owner: 'app/storage', kind: 'gm', key: 'yomu:srs-local:v1' },

    // Anki status index (GM leases + IndexedDB store).
    { owner: 'anki/status-index', kind: 'gm', key: 'yomu:anki-status-index:v1' },
    { owner: 'anki/status-index', kind: 'gm', key: 'yomu:anki-status-index-rebuild:v1' },
    { owner: 'anki/status-index', kind: 'idb', key: 'yomu-anki-status-index' },

    // Bunpro vocab SRS-state index for page word colouring.
    { owner: 'bunpro/word-states', kind: 'gm', key: 'yomu:bunpro-word-states:v1' },

    // Public lookup caches.
    { owner: 'jpdb/jpdb-public-cache', kind: 'gm', key: 'yomu:jpdb-cache:v1' },
    { owner: 'dictionaries/jiten-public-cache (legacy)', kind: 'gm', key: 'yomu:jiten-public-cache:v1' },
    { owner: 'dictionaries/jiten-public-cache', kind: 'gm', key: 'yomu:jiten-public-cache:v2' },
    { owner: 'dictionaries/jiten-stats-cache', kind: 'gm', key: 'jpdb-reader-jiten-daily-stats' },

    // Dictionary database (Yomitan/Jitendex terms). Cleared by the dictionary
    // store's own deleteDatabase during reset; registered so the invariant test
    // asserts it and the reset sweep nets it as a fallback.
    { owner: 'dictionaries/yomitan', kind: 'idb', key: 'jpdb-popup-reader-yomitan' },

    // OCR result cache.
    { owner: 'ocr/ocr-cache-store', kind: 'local', key: 'yomu-ocr-cache-v1' },
    { owner: 'ocr/ocr-cache-store', kind: 'local', key: 'yomu-ocr-cache-v2' },
    { owner: 'ocr/canvas-mirror', kind: 'session', key: 'yomu:bw:mirror-loadguard' },

    // Reader CSS cache (version-suffixed → prefix family).
    { owner: 'styles/index', kind: 'gm', prefix: 'yomu:reader-css-cache:v2:' },

    // Study / grammar / mining stores.
    { owner: 'study/grammar-knowledge', kind: 'gm', key: 'yomu.grammarPreferences.v1' },
    { owner: 'study/mining-context', kind: 'gm', prefix: 'yomu-mining-context:' },
    { owner: 'dictionaries/uchisen-carousel', kind: 'gm', prefix: 'yomu-jpdb-uchisen-index:' },

    // Popup / drawer geometry.
    { owner: 'popup/shell', kind: 'gm', key: 'jpdb-reader-sheet-height-ratio' },
    { owner: 'popup/shell', kind: 'gm', key: 'jpdb-reader-settings-drawer-height-ratio' },

    // Sources open/closed state.
    { owner: 'sources/state', kind: 'gm', key: 'jpdb-reader-source-open-state' },

    // Subtitle layout geometry.
    { owner: 'subtitles/subtitle-layout', kind: 'gm', key: 'jpdb-reader-transcript-panel-size' },
    { owner: 'subtitles/subtitle-layout', kind: 'gm', key: 'jpdb-reader-subtitle-drag-offset' },
    { owner: 'subtitles/subtitle-layout', kind: 'gm', key: 'jpdb-reader-subtitle-control-rail-position' },

    // YouTube subscription snapshot + oembed title cache.
    { owner: 'subtitles/youtube', kind: 'gm', key: 'yomu:youtube-all-subscribed:v1' },
    { owner: 'subtitles/youtube', kind: 'session', prefix: 'yomu:youtube-oembed-title:v1:' },
    { owner: 'subtitles/controller', kind: 'session', prefix: 'yomu:subtitle-parse:v3:' },

    // New Tab study surface stores.
    { owner: 'newtab/state', kind: 'gm', key: 'jpdb-reader-newtab-ui' },
    { owner: 'newtab/cache', kind: 'gm', key: 'jpdb-reader-newtab-card-cache' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-grade-queue' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-current-word' },
    { owner: 'newtab/controller-config', kind: 'session', key: 'jpdb-reader-newtab-current-word' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-jpdb-stats-history' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-disabled-anki-decks' },
    { owner: 'newtab/session-progress', kind: 'local', key: 'jpdb-reader-newtab-daily-study-time' },
    { owner: 'newtab/controller', kind: 'gm', key: 'yomu-newtab-support-banner-dismissed' },

    // Local pitch-accent SRS (debounced writer — the canonical reset escapee).
    { owner: 'newtab/pitch-srs', kind: 'gm', key: 'yomu-pitch-items:v1' },
    { owner: 'newtab/pitch-srs', kind: 'gm', key: 'yomu-pitch-history:v1' },
] as const;

let manifestRegistered = false;

/** Register the full manifest once. Safe to call repeatedly. */
// fallow-ignore-next-line unused-export
export function registerManagedStateManifest(): void {
    if (manifestRegistered) return;
    manifestRegistered = true;
    registerManagedStates(MANAGED_STATE_MANIFEST);
}

// Register on import so anything that pulls in the storage layer has the full
// inventory available without an explicit boot step.
registerManagedStateManifest();
