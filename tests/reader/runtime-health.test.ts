import { beforeEach, describe, expect, it, vi } from 'vitest';

const companions = vi.hoisted(() => ({
    copy: undefined as undefined | Record<string, unknown>,
    dictionaries: undefined as undefined | Record<string, unknown>,
    study: undefined as undefined | Record<string, unknown>,
    anki: undefined as undefined | Record<string, unknown>,
}));

vi.mock('../../src/reader/companions/registry', () => ({
    yomuI18nCompanion: () => companions.copy,
    yomuLocalDictionaries: () => companions.dictionaries,
    yomuKanjiStudyCompanion: () => companions.study,
    yomuAnkiCompanion: () => companions.anki,
}));

import {
    currentReaderRuntimeHealth,
    publishReaderRuntimeHealth,
    readReaderRuntimeHealth,
    readerRuntimeConforms,
    READER_RUNTIME_MARKER_ID,
} from '../../src/reader/app/runtime-health';

describe('Reader runtime service health', () => {
    beforeEach(() => {
        companions.copy = undefined;
        companions.dictionaries = undefined;
        companions.study = undefined;
        companions.anki = undefined;
        document.head.replaceChildren();
    });

    it('distinguishes the claimed shell from a conforming Reader stack', () => {
        const marker = document.createElement('meta');
        marker.id = READER_RUNTIME_MARKER_ID;
        marker.dataset.yomuRuntimeOwner = 'page-1';
        document.head.append(marker);

        const health = publishReaderRuntimeHealth('page-1');

        expect(health?.state).toBe('degraded');
        expect(health?.missing).toEqual(expect.arrayContaining([
            'localization',
            'local-dictionary',
            'translation',
            'grammar',
            'mining',
            'anki',
        ]));
        expect(readerRuntimeConforms(readReaderRuntimeHealth())).toBe(false);
    });

    it('publishes ready only when every companion-backed service is installed', () => {
        companions.copy = { uiText() {} };
        companions.dictionaries = { YomitanDictionaryStore: class {} };
        companions.study = {
            translateJapaneseSentence() {},
            detectGrammarHints() {},
            listLocalGrammarRules() {},
            normalizeMiningSentence() {},
            StudySourceController: class {},
        };
        companions.anki = { AnkiConnectClient: class {} };
        const marker = document.createElement('meta');
        marker.id = READER_RUNTIME_MARKER_ID;
        marker.dataset.yomuRuntimeOwner = 'page-2';
        document.head.append(marker);

        expect(currentReaderRuntimeHealth()).toMatchObject({ state: 'ready', missing: [] });
        expect(publishReaderRuntimeHealth('stale-owner')).toBeNull();
        expect(publishReaderRuntimeHealth('page-2')?.state).toBe('ready');
        expect(readerRuntimeConforms(readReaderRuntimeHealth())).toBe(true);
    });
});
