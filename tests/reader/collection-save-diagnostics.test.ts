import { afterEach, describe, expect, it, vi } from 'vitest';
import { BunproClient } from '../../src/reader/bunpro/bunpro';
import { createBunproSrsAdapter } from '../../src/reader/srs/bunpro';
import { runCardActionOperation } from '../../src/reader/cards/action-operation';
import { DEFAULT_SETTINGS, testCardActionController } from './jpdb/fixtures';
import { newTabLocalFallbackController, newTabTestCard } from './new-tab-review/fixtures';
import { HOSTED_STUDY_LOCATION, installGmStorageFixture } from './helpers/settings-persistence-fixture';

const WORD = newTabTestCard({ spelling: '食べる', reading: 'たべる', source: 'jpdb' });
const settings = { ...DEFAULT_SETTINGS, interfaceLanguage: 'en' as const, apiKey: '', jitenApiKey: '',
    bunproMiningEnabled: true, bunproFrontendApiToken: 'fixture-private-token', yomuLocalSrsEnabled: false,
    jpdbMiningEnabled: false, ankiEnabled: false, newTabSource: 'dictionary' as const, newTabParsingEnabled: false,
    newTabAnkiEnabled: false, newTabEnabled: true, onboardingSeen: true, learningTargetChosen: true,
    immersionKitEnabled: false, audioEnabled: false };

async function save(controller: ReturnType<typeof testCardActionController>, word = WORD) {
    const toast = vi.fn();
    const button = document.createElement('button');
    await runCardActionOperation(button, async () => { await controller.perform(
        { kind: 'card-action', action: 'add', deckSource: 'bunpro', deckId: 'bunpro' }, button, { ...word }); },
        { logger: { warn: () => undefined }, warning: 'Fixture failed save', action: 'add', term: word.spelling, language: 'en', toast }, () => undefined);
    return toast;
}

async function openStudy(language: 'en' | 'ja' = 'en') {
    vi.stubGlobal('location', { ...HOSTED_STUDY_LOCATION, search: '', hash: '' });
    const controller = newTabLocalFallbackController({ ...settings, interfaceLanguage: language }, WORD, async () => []);
    await controller.renderPage();
    return controller;
}

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); localStorage.clear(); });

describe('failed collection save followed by opening Study', () => {
    it('keeps the actual provider reason available after leaving the popup, until dismissed', async () => {
        const profile = installGmStorageFixture();
        // Deterministic provider-response fixture: Bunpro has no vocabulary match.
        // The real client and adapter reject the save before any add request.
        const request = vi.fn(async () => ({ vocabs: { data: [] } }));
        const controller = testCardActionController({ getSettings: () => settings,
            accountDataSurfaceTrusted: () => false,
            srsAdapters: { bunpro: createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => settings.bunproFrontendApiToken, requestImpl: request })) } });
        const toast = await save(controller);
        expect(toast).toHaveBeenCalledWith('This word was not saved. Try again, or open Study for details.');
        expect(request).toHaveBeenCalledTimes(1);
        document.body.replaceChildren();

        const study = await openStudy();
        const notice = document.querySelector<HTMLElement>('[data-collection-failure]');
        expect(notice?.textContent).toContain('食べる');
        expect(notice?.textContent).toContain('Bunpro has no entry for this word.');
        expect(JSON.stringify([...profile.values])).not.toContain(settings.bunproFrontendApiToken);
        study.destroy();
        document.body.replaceChildren();

        const japaneseStudy = await openStudy('ja');
        expect(document.querySelector('[data-collection-failure]')?.textContent).toContain('この単語はBunproに見つかりませんでした。');
        document.querySelector<HTMLButtonElement>('[data-newtab-action="dismiss-collection-failure"]')!.click();
        await vi.waitFor(() => expect(document.querySelector('[data-collection-failure]')).toBeNull());
        japaneseStudy.destroy();
        document.body.replaceChildren();
        const freshStudy = await openStudy();
        expect(document.querySelector('[data-collection-failure]')).toBeNull();
        freshStudy.destroy();
    });

    it('persists a rejected add request without its raw payload and clears it only after that word saves', async () => {
        const profile = installGmStorageFixture();
        let rejected = true;
        const request = vi.fn(async (url: string) => {
            if (url.endsWith('/search/reviewables_v1_1')) return { vocabs: { data: [
                { id: 42, reviewable_type: 'Vocab', word: '食べる', reading: 'たべる', meaning: 'to eat' },
                { id: 43, reviewable_type: 'Vocab', word: '本', reading: 'ほん', meaning: 'book' },
            ] } };
            if (rejected) throw new Error(`Provider rejected token=${settings.bunproFrontendApiToken} secret response body`);
            return { ok: true };
        });
        const controller = testCardActionController({ getSettings: () => settings,
            accountDataSurfaceTrusted: () => false,
            srsAdapters: { bunpro: createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => settings.bunproFrontendApiToken, requestImpl: request })) } });
        expect(await save(controller)).toHaveBeenCalledWith('This word was not saved. Try again, or open Study for details.');
        expect(request.mock.calls.some(([url]) => url.endsWith('/reviews/update_via_action_type'))).toBe(true);
        const study = await openStudy();
        expect(document.querySelector('[data-collection-failure]')?.textContent).toContain('The deck service did not confirm this save.');
        const persisted = JSON.stringify([...profile.values]);
        expect(persisted).not.toContain(settings.bunproFrontendApiToken);
        expect(persisted).not.toContain('secret response body');
        study.destroy();
        document.body.replaceChildren();

        rejected = false;
        await save(controller, newTabTestCard({ spelling: '本', reading: 'ほん', source: 'jpdb' }));
        const afterOtherWord = await openStudy();
        expect(document.querySelector('[data-collection-failure]')?.textContent).toContain('食べる');
        afterOtherWord.destroy();
        document.body.replaceChildren();
        await save(controller);
        const afterSavedWord = await openStudy();
        expect(document.querySelector('[data-collection-failure]')).toBeNull();
        afterSavedWord.destroy();
    });

    it('does not promise Study details when failure storage itself rejects the write', async () => {
        installGmStorageFixture(new Map(), { beforeSet: key => {
            if (key === 'yomu:collection-save-failure:v1') throw new Error('fixture quota exceeded');
        } });
        const controller = testCardActionController({ getSettings: () => settings,
            accountDataSurfaceTrusted: () => false,
            srsAdapters: { bunpro: createBunproSrsAdapter(new BunproClient({ getFrontendToken: () => settings.bunproFrontendApiToken,
                requestImpl: async () => ({ vocabs: { data: [] } }) })) } });
        expect(await save(controller)).toHaveBeenCalledWith('This word was not saved. Its error details could not be stored. Check your connection and settings, then try again.');
    });
});
