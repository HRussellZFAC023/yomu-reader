// v1.9.3 userscript stores (Tampermonkey-style GM_* shared by every site).
//   a   setup in hosted Study through the bridge, then a Settings Save on a site
//   a2  the same learner after a v1.9.3 Factory reset (epoch-slotted keys)
//   b   a v1.8.80 record that declared nothing, carried by v1.9.3 machine writes
//       (b0: the same record before 1.9.3 wrote anything at all)
//   c1  1.8.80 pins -> 1.8.90 unmarked ledger -> a v1.9.3 declared Save
//   c2  the same chain carried only by a v1.9.3 machine write
import { describe, it, vi } from 'vitest';
import { createFactoryResetCoordinator } from '@yomu-ref/src/reader/app/factory-reset-coordinator';
import {
    installDeterministicClock,
    persistentWrites,
    readCorpusFile,
    writeScenario,
} from '../lib/corpus-output';
import {
    createRecordingStore,
    OriginWebStorage,
    storeSnapshot,
    type RecordingStore,
} from '../lib/realm-stubs';
import { CORPUS_JPDB_API_KEY, LEARNER_CHOICES, SITE_URL } from '../lib/learner-story';
import {
    completeOnboarding,
    controlSave,
    dialogSave,
    enterHostedStudyWithUserscript,
    enterUserscriptSite,
    machineSave,
    visibleAfterReload,
} from '../lib/v193-reader';

const { apiKey: _apiKey, ...siteChoices } = LEARNER_CHOICES;

interface Install {
    readonly gm: RecordingStore;
    readonly origins: OriginWebStorage;
}

function freshInstall(gm: Record<string, unknown> = {}, web: Record<string, Record<string, string>> = {}): Install {
    return { gm: createRecordingStore('gm', gm), origins: new OriginWebStorage(web) };
}

async function setUpThroughHostedStudy(install: Install): Promise<void> {
    installDeterministicClock();
    enterHostedStudyWithUserscript(install.gm, install.origins);
    await completeOnboarding('ja');
    await dialogSave({ apiKey: CORPUS_JPDB_API_KEY });
}

async function saveOnSite(install: Install): Promise<void> {
    installDeterministicClock();
    enterUserscriptSite(install.gm, install.origins, SITE_URL);
    await dialogSave(siteChoices);
}

async function recordOnSite(name: string, install: Install, story: string, inputs: string[] = []): Promise<void> {
    installDeterministicClock();
    enterUserscriptSite(install.gm, install.origins, SITE_URL);
    const expected = await visibleAfterReload();
    writeScenario(name, {
        channel: 'userscript',
        story,
        location: SITE_URL,
        gm: storeSnapshot(install.gm),
        webStorage: install.origins.snapshot(),
        writes: persistentWrites(install.gm),
        expected,
    }, inputs);
}

function upgradeFrom(input: string): Install {
    const stored = readCorpusFile<{ gm: Record<string, unknown> }>(input);
    return freshInstall(stored.gm);
}

describe('v1.9.3 userscript', () => {
    const a = freshInstall();
    it('a: onboarding and API key in hosted Study, then a Settings Save on a site', async () => {
        await setUpThroughHostedStudy(a);
        await saveOnSite(a);
        await recordOnSite('a-userscript-explicit-save', a,
            'Fresh v1.9.3 userscript: setup and JPDB key in yomureader.com/study, then Save of theme, subtitle size and furigana on an ordinary site.');
    });

    it('a2: the same learner after a v1.9.3 Factory reset', async () => {
        const reset = freshInstall(storeSnapshot(a.gm), a.origins.snapshot());
        installDeterministicClock();
        enterUserscriptSite(reset.gm, reset.origins, SITE_URL);
        vi.stubGlobal('confirm', () => true);
        await createFactoryResetCoordinator({
            dictionaries: { deleteDatabase: async () => undefined },
            getLanguage: () => 'en',
            invalidateRuntimeStores: async () => undefined,
            isDestroyed: () => false,
            reload: () => undefined,
            toast: message => { throw new Error(`v1.9.3 factory reset failed: ${message}`); },
        }).resetAllData();
        await setUpThroughHostedStudy(reset);
        await saveOnSite(reset);
        await recordOnSite('a2-userscript-after-factory-reset', reset,
            'The (a) learner runs Factory reset in v1.9.3 and sets up again: every key now lives in an epoch slot.');
    });

    it('b: a record that declared nothing, carried only by v1.9.3 machine writes', async () => {
        const input = 'inputs/v1.8.80-undeclared.json';
        const untouched = upgradeFrom(input);
        await recordOnSite('b0-userscript-untouched-pre-ledger', untouched,
            'A full settings record with no pins and no ledger that v1.9.3 read but never rewrote.', [input]);
        const carried = upgradeFrom(input);
        installDeterministicClock();
        enterUserscriptSite(carried.gm, carried.origins, SITE_URL);
        await machineSave({ apiGradingProvider: 'jpdb' });
        await recordOnSite('b-userscript-machine-only-unmarked', carried,
            'The same record after v1.9.3 set apiGradingProvider on the first review: still no commit marker, no ledger.', [input]);
    });

    it('c1: 1.8.80 pins and a 1.8.90 ledger, then a declared v1.9.3 Save', async () => {
        const input = 'inputs/v1.8.90-ledger.json';
        const install = upgradeFrom(input);
        installDeterministicClock();
        enterUserscriptSite(install.gm, install.origins, SITE_URL);
        await controlSave({ interfaceLanguage: 'ja' });
        await recordOnSite('c1-userscript-folded-pins-explicit', install,
            'v1.8.80 pins folded by v1.8.90 at seq 0; v1.9.3 then commits a marked pair when the learner switches the interface to Japanese.', [input]);
    });

    it('c2: the same chain carried only by a v1.9.3 machine write', async () => {
        const input = 'inputs/v1.8.90-ledger.json';
        const install = upgradeFrom(input);
        installDeterministicClock();
        enterUserscriptSite(install.gm, install.origins, SITE_URL);
        await machineSave({ apiGradingProvider: 'jpdb' });
        await recordOnSite('c2-userscript-folded-pins-machine', install,
            'v1.8.80 pins folded by v1.8.90 at seq 0; v1.9.3 only made an undeclared write, so settings and ledger stay unmarked.', [input]);
    });
});
