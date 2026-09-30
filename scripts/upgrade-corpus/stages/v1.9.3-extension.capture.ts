// v1.9.3 packaged extension (Chrome/Firefox/Safari store builds).
//   d  setup in packaged Study (moz-extension://…/newtab/), then a Settings
//      Save from the content script on YouTube.
// Both realms reach one browser.storage.local through the UserScript
// Compiler's GM_* runtime, which stores every logical key under
// COMPILER_STORAGE_PREFIX; the fixture keeps the physical keys and a logical view.
import { describe, it } from 'vitest';
import { ensureExtensionStudySettingsAuthority } from '@yomu-ref/src/reader/newtab/extension-settings-recovery-guard';
import {
    installDeterministicClock,
    persistentWrites,
    writeScenario,
} from '../lib/corpus-output';
import {
    COMPILER_STORAGE_PREFIX,
    createRecordingStore,
    EXTENSION_STUDY_URL,
    OriginWebStorage,
    storeSnapshot,
} from '../lib/realm-stubs';
import { CORPUS_JPDB_API_KEY, LEARNER_CHOICES, YOUTUBE_URL } from '../lib/learner-story';
import {
    completeOnboarding,
    dialogSave,
    enterExtensionContentScript,
    enterPackagedStudy,
    visibleAfterReload,
} from '../lib/v193-reader';

const { apiKey: _apiKey, ...pageChoices } = LEARNER_CHOICES;
const STUDY_TARGET = 'es';

function logicalView(physical: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(physical)
        .filter(([key]) => key.startsWith(COMPILER_STORAGE_PREFIX))
        .map(([key, value]) => [key.slice(COMPILER_STORAGE_PREFIX.length), value]));
}

describe('v1.9.3 packaged extension', () => {
    const storage = createRecordingStore('extension');
    const origins = new OriginWebStorage();

    it('d: setup in packaged Study, then a Settings Save from the YouTube content script', async () => {
        installDeterministicClock();
        enterPackagedStudy(storage, origins);
        await ensureExtensionStudySettingsAuthority();
        await completeOnboarding(STUDY_TARGET);
        await dialogSave({ apiKey: CORPUS_JPDB_API_KEY });

        installDeterministicClock();
        enterExtensionContentScript(storage, origins, YOUTUBE_URL);
        await dialogSave(pageChoices);

        installDeterministicClock();
        enterExtensionContentScript(storage, origins, YOUTUBE_URL);
        const contentScript = await visibleAfterReload();
        installDeterministicClock();
        enterPackagedStudy(storage, origins);
        await ensureExtensionStudySettingsAuthority();
        const study = await visibleAfterReload();

        const physical = storeSnapshot(storage);
        writeScenario('d-extension-study-and-content-script', {
            channel: 'extension',
            story: 'Fresh v1.9.3 store extension: setup (Spanish) and JPDB key in packaged Study, then theme, subtitle size and furigana saved from the YouTube content script.',
            compilerStoragePrefix: COMPILER_STORAGE_PREFIX,
            studyUrl: EXTENSION_STUDY_URL,
            contentScriptUrl: YOUTUBE_URL,
            extensionStorageLocal: physical,
            logicalKeys: logicalView(physical),
            webStorage: origins.snapshot(),
            writes: persistentWrites(storage),
            expected: { study, contentScript },
        });
    });
});
