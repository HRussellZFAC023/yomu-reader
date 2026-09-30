// v1.8.90 writers: the pre-commit-marker intent ledger era (1.8.81-1.9.0).
// Upgrades the v1.8.80 pin store exactly as a learner's next explicit Save did:
// the ledger folds the flat pins in at seq 0 and records the new choice after.
import { describe, it } from 'vitest';
import { changedSettingsKeys, loadSettings, saveSettings } from '@yomu-ref/src/reader/settings/index';
import {
    installDeterministicClock,
    readCorpusFile,
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
import { SITE_URL, UPGRADE_ACCENT_COLOR } from '../lib/learner-story';

describe('v1.8.90 writers', () => {
    it('an explicit Save over the v1.8.80 pin store writes the first (unmarked) ledger', async () => {
        const input = readCorpusFile<{ gm: Record<string, unknown> }>('inputs/v1.8.80-pinned.json');
        const gm = createRecordingStore('gm', input.gm);
        installDeterministicClock();
        setLocation(SITE_URL);
        installGmApi(gm);
        localStorage.clear();
        const previous = await loadSettings();
        const next = { ...previous, accentColor: UPGRADE_ACCENT_COLOR };
        await saveSettings(next, {
            persistPreferredJapaneseSiteLanguage: false,
            explicitUserChoiceKeys: changedSettingsKeys(previous, next),
        });
        writeCorpusFile('inputs/v1.8.90-ledger.json', {
            producedBy: { tag: 'v1.8.90', commit: referenceCommit(), input: 'inputs/v1.8.80-pinned.json' },
            story: 'The v1.8.80 learner updates to v1.8.90 and picks a new accent colour in Settings.',
            location: SITE_URL,
            gm: storeSnapshot(gm),
            localStorage: webStorageSnapshot(localStorage),
            writes: gm.writes,
        });
    });
});
