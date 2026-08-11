import { beforeEach, describe, expect, it, vi } from 'vitest';

const companions = vi.hoisted(() => ({
    annotations: undefined as undefined | Record<string, unknown>,
    copy: undefined as undefined | Record<string, unknown>,
    dictionaries: undefined as undefined | Record<string, unknown>,
    study: undefined as undefined | Record<string, unknown>,
    anki: undefined as undefined | Record<string, unknown>,
    bunpro: undefined as undefined | Record<string, unknown>,
}));

vi.mock('../../src/reader/companions/registry', () => ({
    yomuAnnotationsCompanion: () => companions.annotations,
    yomuI18nCompanion: () => companions.copy,
    yomuLocalDictionaries: () => companions.dictionaries,
    yomuKanjiStudyCompanion: () => companions.study,
    yomuAnkiCompanion: () => companions.anki,
    yomuBunproCompanion: () => companions.bunpro,
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
        companions.annotations = undefined;
        companions.copy = undefined;
        companions.dictionaries = undefined;
        companions.study = undefined;
        companions.anki = undefined;
        companions.bunpro = undefined;
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
            'bunpro',
            'annotation-layout',
            'pitch',
        ]));
        expect(readerRuntimeConforms(readReaderRuntimeHealth())).toBe(false);
    });

    it('publishes ready only when every companion-backed service is installed', () => {
        companions.annotations = {
            syncProjectedReadings() {},
            clearProjectedReadings() {},
        };
        companions.copy = { uiText() {} };
        companions.dictionaries = { YomitanDictionaryStore: class {} };
        companions.study = {
            translateTargetSentence() {},
            detectGrammarHints() {},
            listLocalGrammarRules() {},
            normalizeMiningSentence() {},
            StudySourceController: class {},
        };
        companions.anki = { AnkiConnectClient: class {} };
        companions.bunpro = { BunproClient: class {} };
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
