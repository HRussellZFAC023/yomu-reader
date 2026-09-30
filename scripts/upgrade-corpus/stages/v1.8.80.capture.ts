// v1.8.80 writers: the last release with the flat 'yomu:explicit-user-settings:v1'
// pin store (1.8.37-1.8.80) and no intent ledger. Produces the INPUT stores the
// v1.8.90 and v1.9.3 stages upgrade; nothing here is asserted against v2.
import { describe, it } from 'vitest';
import {
    changedSettingsKeys,
    loadSettings,
    saveSettings,
} from '@yomu-ref/src/reader/settings/index';
import {
    changedAutomationProtectedSettingsKeys,
    coupledExplicitUserChoiceKeys,
} from '@yomu-ref/src/reader/settings/explicit-user-choice';
import type { ReaderSettings } from '@yomu-ref/src/reader/app/types';
import {
    installDeterministicClock,
    referenceCommit,
    writeCorpusFile,
} from '../lib/corpus-output';
import {
    createRecordingStore,
    installGmApi,
    setLocation,
    storeSnapshot,
    webStorageSnapshot,
} from '../lib/realm-stubs';
import { LEARNER_CHOICES, SITE_URL } from '../lib/learner-story';

const pinned = createRecordingStore('gm');
const machineOnly = createRecordingStore('gm');

function enterSite(store: typeof pinned): () => void {
    const tick = installDeterministicClock();
    setLocation(SITE_URL);
    installGmApi(store);
    localStorage.clear();
    return tick;
}

function learnerEdits(settings: ReaderSettings): ReaderSettings {
    return { ...settings, ...LEARNER_CHOICES } as ReaderSettings;
}

describe('v1.8.80 writers', () => {
    it('onboarding then a Settings dialog Save (writes the flat pin store)', async () => {
        const tick = enterSite(pinned);
        const first = await loadSettings();
        const onboarded = { ...first, onboardingSeen: true };
        await saveSettings(onboarded, {
            explicitUserChoiceKeys: changedAutomationProtectedSettingsKeys(first, onboarded),
        });
        tick();
        const previous = await loadSettings();
        const next = learnerEdits(previous);
        await saveSettings(next, {
            persistPreferredJapaneseSiteLanguage: false,
            explicitUserChoiceKeys: coupledExplicitUserChoiceKeys(changedSettingsKeys(previous, next)),
        });
        writeCorpusFile('inputs/v1.8.80-pinned.json', {
            producedBy: { tag: 'v1.8.80', commit: referenceCommit() },
            story: 'Onboarding, then Settings Save of the learner choices under v1.8.80 (userscript).',
            location: SITE_URL,
            gm: storeSnapshot(pinned),
            localStorage: webStorageSnapshot(localStorage),
            writes: pinned.writes,
        });
    });

    it('the same choices carried only by writes that declare nothing (no pins)', async () => {
        enterSite(machineOnly);
        const first = await loadSettings();
        await saveSettings(learnerEdits({ ...first, onboardingSeen: true }), { explicitUserChoiceKeys: [] });
        writeCorpusFile('inputs/v1.8.80-undeclared.json', {
            producedBy: { tag: 'v1.8.80', commit: referenceCommit() },
            story: 'A pre-pin-store settings record (full object, no pins, no ledger) as v1.8.80 writes it.',
            location: SITE_URL,
            gm: storeSnapshot(machineOnly),
            localStorage: webStorageSnapshot(localStorage),
            writes: machineOnly.writes,
        });
    });
});
