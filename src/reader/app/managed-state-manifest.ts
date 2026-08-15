import { registerManagedStates, type ManagedStateEntry } from './managed-state-registry';
import { yomuLocalDictionaries } from '../companions/registry';

async function enumerateDictionaryArchiveStorageKeys(): Promise<string[]> {
    const enumerate = yomuLocalDictionaries()?.enumerateDictionaryArchiveStorageKeys;
    if (!enumerate) throw new Error('The local-dictionary companion cannot enumerate archive storage.');
    return enumerate();
}

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
// invariant test can seed and assert them. Prefix owners enrich their rows with
// an authoritative enumerator when they can reset safely without GM_listValues.
const MANAGED_STATE_MANIFEST: readonly ManagedStateEntry[] = [
    // Settings (also legacy migration keys). The bunpro token / pill selections /
    // colours all live inside these settings objects.
    { owner: 'settings', kind: 'gm', key: 'jpdb-popup-reader-settings' },
    { owner: 'settings (legacy)', kind: 'gm', key: 'jpdb-reader-settings' },
    { owner: 'settings (legacy)', kind: 'gm', key: 'yomu-reader-settings' },
    { owner: 'settings (legacy)', kind: 'gm', key: 'yomu-settings' },
    { owner: 'settings', kind: 'gm', key: 'yomu:prefer-japanese-site-language:v1' },
    { owner: 'settings (pre-ledger pins)', kind: 'gm', key: 'yomu:explicit-user-settings:v1' },
    { owner: 'settings/intent-ledger', kind: 'gm', key: 'yomu:settings-intent:v2' },
    { owner: 'settings/extension-study-settings-recovery', kind: 'gm', key: 'yomu:extension-study-legacy-promotion:v1' },

    // Private, one-use cloud settings OAuth handoff. The old page-readable key
    // remains reset-only so upgrades erase a stranded pre-1.9 callback marker.
    { owner: 'settings/dialog-controller', kind: 'gm', key: 'yomu:private:cloud-settings-sync-pending:v1' },
    { owner: 'settings/dialog-controller (legacy)', kind: 'gm', key: '__yomu_cloud_settings_sync_pending_action' },

    // App-level signals / flags / caches.
    { owner: 'app/storage', kind: 'gm', key: 'yomu:factory-reset-signal' },
    { owner: 'app/storage epoch', kind: 'gm', key: 'yomu:state-epoch' },
    { owner: 'app/storage epoch slots', kind: 'gm', prefix: 'yomu:state-slot:v1:' },
    { owner: 'app/storage epoch lease', kind: 'gm', prefix: 'yomu:state-epoch-lease:v1:' },
    { owner: 'app/managed-web-storage', kind: 'local', key: 'yomu:web-storage-epoch:v1:local' },
    { owner: 'app/managed-web-storage', kind: 'session', key: 'yomu:web-storage-epoch:v1:session' },
    { owner: 'app/managed-web-storage', kind: 'local', prefix: 'yomu:web-storage-slot:v1:' },
    { owner: 'app/managed-web-storage', kind: 'session', prefix: 'yomu:web-storage-slot:v1:' },
    { owner: 'app/storage local provenance', kind: 'local', key: 'yomu:local-storage-provenance:v1' },
    { owner: 'app/card-state-signal', kind: 'gm', key: 'yomu:card-state-signal' },
    { owner: 'app/storage leases', kind: 'gm', prefix: 'yomu:lease:' },
    { owner: 'srs/account-sync', kind: 'gm', key: 'yomu:private:academy-device:v1' },
    { owner: 'srs/account-sync', kind: 'gm', key: 'yomu:private:academy-device-pending:v1' },
    { owner: 'app/logger', kind: 'gm', key: 'yomu:enable-logs' },
    { owner: 'app/main', kind: 'local', key: 'yomu:jpdb-review-examples-visible:v1' },
    { owner: 'core/hosted-appearance-boot', kind: 'local', key: 'yomu-page-theme' },
    // Deliberately per-origin: this is the bootstrap hint for this site, never
    // the preference itself. Runtime reads and writes use the managed facade.
    { owner: 'app/preferred-site-language', kind: 'local', key: 'yomu:prefer-japanese-site-language' },
    { owner: 'app/preferred-site-language', kind: 'session', key: 'yomu:jps' },
    { owner: 'app/preferred-site-language', kind: 'session', key: 'yomu:jps:hosts' },

    // Local no-account SRS deck.
    { owner: 'srs/local-yomu-store (legacy)', kind: 'gm', key: 'yomu:srs-local:v1' },
    { owner: 'srs/local-yomu-store', kind: 'gm', prefix: 'yomu:srs-local:v2:' },

    // Anki status index (GM leases + IndexedDB store).
    { owner: 'anki/status-index', kind: 'gm', key: 'yomu:anki-status-index:v1' },
    { owner: 'anki/status-index', kind: 'gm', key: 'yomu:anki-status-index-rebuild:v1' },
    { owner: 'anki/status-index', kind: 'idb', key: 'yomu-anki-status-index' },

    // Bunpro vocab SRS-state index for page word colouring.
    { owner: 'bunpro/word-states', kind: 'gm', key: 'yomu:bunpro-word-states:v1' },

    // Public lookup caches.
    { owner: 'jpdb/jpdb-public-cache', kind: 'local', key: 'yomu:jpdb-cache:v1' },
    { owner: 'dictionaries/jiten-public-cache (legacy)', kind: 'gm', key: 'yomu:jiten-public-cache:v1' },
    { owner: 'dictionaries/jiten-public-cache', kind: 'local', key: 'yomu:jiten-public-cache:v2' },
    { owner: 'dictionaries/jiten-stats-cache', kind: 'gm', key: 'jpdb-reader-jiten-daily-stats' },

    // Dictionary database (Yomitan/Jitendex terms). Cleared by the dictionary
    // store's own deleteDatabase during reset; registered so the invariant test
    // asserts it and the reset sweep nets it as a fallback.
    { owner: 'dictionaries/yomitan', kind: 'idb', key: 'jpdb-popup-reader-yomitan' },
    { owner: 'dictionaries/archive-cache', kind: 'gm', key: 'yomu-dictionary-archives' },
    {
        owner: 'dictionaries/archive-cache',
        kind: 'gm',
        prefix: 'yomu-dictionary-archive:',
        enumerate: enumerateDictionaryArchiveStorageKeys,
    },
    // Replication was removed in 1.8.78 (dictionaries live only where they
    // are imported); the state key stays registered so resets sweep what
    // earlier releases left behind.
    { owner: 'dictionaries/replication (legacy)', kind: 'local', key: 'yomu-dictionary-replication-state' },
    { owner: 'dictionaries/replica-purge', kind: 'gm', key: 'yomu:dictionary-replica-purge:v1' },
    { owner: 'dictionaries/replica-purge', kind: 'local', key: 'yomu:dictionary-replica-purged:v1' },

    // OCR result cache.
    { owner: 'ocr/ocr-cache-store', kind: 'local', key: 'yomu-ocr-cache-v1' },
    { owner: 'ocr/ocr-cache-store', kind: 'local', key: 'yomu-ocr-cache-v2' },
    { owner: 'ocr/canvas-mirror', kind: 'session', key: 'yomu:bw:mirror-loadguard' },

    // Reader CSS last-good cache. v3 is deliberately version-independent (see
    // styles/index) so an upgrade does not start cold; the v2 prefix family
    // stays registered so the per-version entries older installs left behind
    // are still swept on reset.
    { owner: 'styles/index', kind: 'gm', key: 'yomu:reader-css-cache:v3' },
    { owner: 'styles/index (legacy)', kind: 'gm', prefix: 'yomu:reader-css-cache:v2:' },

    // Study / grammar / mining stores.
    { owner: 'study/grammar-knowledge', kind: 'gm', key: 'yomu.grammarPreferences.v1' },
    { owner: 'study/grammar-knowledge', kind: 'gm', prefix: 'yomu.grammarPreferences.v1:' },
    { owner: 'study/mining-context', kind: 'gm', prefix: 'yomu-mining-context:' },
    // Retired Uchisen carousel index. Keep the prefix registered so Factory
    // Reset still removes harmless selection keys left by older releases.
    { owner: 'dictionaries/uchisen-carousel (retired)', kind: 'gm', prefix: 'yomu-jpdb-uchisen-index:' },

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
    { owner: 'subtitles/controller', kind: 'session', prefix: 'yomu:subtitle-parse:v' },

    // New Tab study surface stores.
    { owner: 'newtab/state', kind: 'gm', key: 'jpdb-reader-newtab-ui' },
    { owner: 'newtab/cache', kind: 'gm', key: 'jpdb-reader-newtab-card-cache' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-grade-queue' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-current-word' },
    { owner: 'newtab/controller-config', kind: 'session', key: 'jpdb-reader-newtab-current-word' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-jpdb-stats-history' },
    { owner: 'newtab/controller-config', kind: 'gm', key: 'jpdb-reader-newtab-disabled-anki-decks' },
    { owner: 'newtab/session-progress', kind: 'local', key: 'jpdb-reader-newtab-daily-study-time' },
    { owner: 'newtab/controller', kind: 'local', key: 'yomu-newtab-support-banner-dismissed' },

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
