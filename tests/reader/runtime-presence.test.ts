import { beforeEach, describe, expect, it } from 'vitest';
import {
    announceInstalledReaderRuntime,
    detectInstalledReaderRuntime,
    INSTALLED_READER_RUNTIME_MARKER_ID,
    isHostedReaderRuntime,
    markInstalledReaderRuntime,
    shouldInstallHostedReaderRuntime,
} from '../../src/reader/app/runtime-presence';
import { afterEach } from "vitest";
import { currentReaderRuntimeHealth, publishReaderRuntimeHealth, readReaderRuntimeHealth, readerRuntimeConforms, READER_RUNTIME_MARKER_ID } from "../../src/reader/app/runtime-health";

describe('installed reader runtime presence', () => {
    beforeEach(() => {
        document.head.innerHTML = '';
        document.body.innerHTML = '';
        delete document.documentElement.dataset.yomuHosted;
    });

    it('announces a userscript at document-start through shared DOM state', () => {
        expect(announceInstalledReaderRuntime({ GM_getValue: () => undefined })).toBe('userscript');

        const marker = document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID);
        expect(marker?.dataset.yomuInstalledRuntimeKind).toBe('userscript');
    });

    it('does not make the page-injected hosted bundle look installed', () => {
        expect(detectInstalledReaderRuntime({})).toBeNull();
        expect(announceInstalledReaderRuntime({})).toBeNull();
        expect(document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)).toBeNull();
    });

    it('prefers an extension when a compiled GM shim is also present', () => {
        expect(detectInstalledReaderRuntime({
            chrome: { runtime: { id: 'installed-yomu' } },
            GM_getValue: () => undefined,
        })).toBe('extension');
    });

    it('blocks the production hosted fallback while preserving local runtime QA', () => {
        markInstalledReaderRuntime('userscript');

        expect(shouldInstallHostedReaderRuntime(false)).toBe(false);
        expect(shouldInstallHostedReaderRuntime(true)).toBe(true);
    });

    it('keeps the page application hosted beside an installed DOM storage bridge', () => {
        markInstalledReaderRuntime('userscript');
        document.documentElement.dataset.yomuHosted = '';

        expect(document.getElementById(INSTALLED_READER_RUNTIME_MARKER_ID)?.dataset.yomuInstalledRuntimeKind)
            .toBe('userscript');
        expect(isHostedReaderRuntime()).toBe(true);
    });
});

describe('Reader runtime service health', () => {
    const companions = {
        annotations: undefined as undefined | Record<string, unknown>,
        copy: undefined as undefined | Record<string, unknown>,
        dictionaries: undefined as undefined | Record<string, unknown>,
        study: undefined as undefined | Record<string, unknown>,
        anki: undefined as undefined | Record<string, unknown>,
        bunpro: undefined as undefined | Record<string, unknown>,
    };





    const original = Object.getOwnPropertyDescriptor(globalThis, '__yomuCompanions');
    afterEach(() => {
        if (original) Object.defineProperty(globalThis, '__yomuCompanions', original);
        else Reflect.deleteProperty(globalThis, '__yomuCompanions');
    });
    beforeEach(() => {
        // Exercise the real registry with explicit absent/present services.
        Object.defineProperty(globalThis, '__yomuCompanions', {
            configurable: true,
            writable: true,
            value: {
                get annotations() { return companions.annotations; },
                get i18n() { return companions.copy; },
                get localDictionaries() { return companions.dictionaries; },
                get kanjiStudy() { return companions.study; },
                get anki() { return companions.anki; },
                get bunpro() { return companions.bunpro; },
            },
        });
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
        companions.dictionaries = { createLocalDictionaryStore() {} };
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
