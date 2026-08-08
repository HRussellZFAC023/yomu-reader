import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The whole point of this file: the target the user stored must reach the
// runtime, and core behaviour must follow it. Every observation below is made
// through a core call site, imported exactly as core ships it — none of these
// files knows any target other than Japanese exists.
import { isLookupableTargetLanguageText } from '../../../src/reader/lookup/text-helpers';
import { newTabCardReading } from '../../../src/reader/newtab/study-queue';
import { isTargetLanguageSubtitleTrack } from '../../../src/reader/subtitles/subtitle-track-metadata';
import {
    targetContentLocale,
    targetOcrLanguageTag,
    targetSpeechSynthesisLocale,
} from '../../../src/reader/languages/resolve';

import {
    activeLearningTarget,
    activeLearningTargetLanguage,
    resetActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { adoptLearningTargetFromSettings } from '../../../src/reader/languages/target-selection';
import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import { KOREAN_LEARNING_TARGET } from '../../../src/reader/languages/korean';
import { createLearningTargetModule } from '../../../src/reader/languages/module';
import {
    normalizeLearningTargetLanguage,
    registerLearningTargetModule,
    unregisterLearningTargetModule,
} from '../../../src/reader/languages/registry';
import {
    activateLanguageProfileForOutputLanguage,
    createDefaultLanguageProfile,
    normalizeLanguageProfiles,
} from '../../../src/reader/languages/profiles';

import { OnboardingController } from '../../../src/reader/app/onboarding';
import { bindReaderRuntimeEvents } from '../../../src/reader/app/runtime-events';
import { loadReaderStartupSettings } from '../../../src/reader/app/startup';
import { SETTINGS_CHANGE_EVENT } from '../../../src/reader/app/constants';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../../src/reader/settings/index';
import type { JPDBCard, ReaderSettings } from '../../../src/reader/app/types';

// Boot reads settings through settings/index. Only the storage read is
// stubbed; normalization, migration and URL bootstrap stay real, so this
// exercises the same path a real install takes.
let storedSettings: ReaderSettings = DEFAULT_SETTINGS;
vi.mock('../../../src/reader/settings/index', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../src/reader/settings/index')>();
    return { ...actual, loadSettings: async () => storedSettings };
});

function card(spelling: string, reading: string): JPDBCard {
    return { spelling, reading } as JPDBCard;
}

/** Settings exactly as they would come back from storage for a chosen target. */
function settingsStoringTarget(targetLanguage: string): ReaderSettings {
    const base = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        activeLanguageProfileId: base.id,
        languageProfiles: [{ ...base, targetLanguage }],
    } as Partial<ReaderSettings>);
}

beforeEach(() => {
    storedSettings = DEFAULT_SETTINGS;
});

afterEach(() => {
    resetActiveLearningTargetLanguage();
    unregisterLearningTargetModule('sw');
    document.body.innerHTML = '';
    localStorage.clear();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Storage: a stored target has to survive normalization to mean anything.
// ---------------------------------------------------------------------------

describe('a stored learning target survives normalization', () => {
    it('keeps a target that has a registered module', () => {
        const settings = settingsStoringTarget('ko');
        expect(settings.languageProfiles[0]?.targetLanguage).toBe('ko');
    });

    it('canonicalizes a regional spelling down to the module it resolves to', () => {
        expect(settingsStoringTarget('ko-KR').languageProfiles[0]?.targetLanguage).toBe('ko');
    });

    it('falls back to Japanese for a target no module is registered for', () => {
        // An unsupported tag must never leave the reader with a target that
        // resolves to nothing — it degrades, it does not strand.
        expect(settingsStoringTarget('qqq').languageProfiles[0]?.targetLanguage).toBe('ja');
        expect(settingsStoringTarget('').languageProfiles[0]?.targetLanguage).toBe('ja');
    });

    it('keeps every picker target because each roster language has a module', () => {
        expect(settingsStoringTarget('en').languageProfiles[0]?.targetLanguage).toBe('en');
        expect(settingsStoringTarget('ar').languageProfiles[0]?.targetLanguage).toBe('ar');
        expect(settingsStoringTarget('zh').languageProfiles[0]?.targetLanguage).toBe('zh-Hans');
    });

    it('defaults a profile with no stored target to Japanese', () => {
        const { targetLanguage, ...withoutTarget } = createDefaultLanguageProfile();
        expect(targetLanguage).toBe('ja');
        const normalized = normalizeLanguageProfiles([withoutTarget], withoutTarget.id);
        expect(normalized.profiles[0]?.targetLanguage).toBe('ja');
    });

    it('carries the target into a profile created for a new definition language', () => {
        const korean = { ...createDefaultLanguageProfile(), targetLanguage: 'ko' };
        const activated = activateLanguageProfileForOutputLanguage([korean], korean.id, 'fr');

        expect(activated.created).toBe(true);
        // Choosing French definitions is not a decision about what is studied.
        expect(activated.profiles.at(-1)?.targetLanguage).toBe('ko');
    });

    it('normalizes a tag straight through the registry', () => {
        expect(normalizeLearningTargetLanguage('ko-KR')).toBe('ko');
        expect(normalizeLearningTargetLanguage('ja-JP')).toBe('ja');
        expect(normalizeLearningTargetLanguage('qqq')).toBe('ja');
        expect(normalizeLearningTargetLanguage(undefined)).toBe('ja');
        expect(normalizeLearningTargetLanguage(null)).toBe('ja');
        expect(normalizeLearningTargetLanguage(42)).toBe('ja');
    });
});

// ---------------------------------------------------------------------------
// 2. The seam carries behaviour. This is the claim the whole contract rests
//    on and, until the profile could select a target, nothing tested it end to
//    end: stored profile -> active target -> what core actually does.
// ---------------------------------------------------------------------------

describe('core behaviour follows the stored profile', () => {
    it('is Japanese for a default install, at every capability core reads', () => {
        expect(adoptLearningTargetFromSettings(DEFAULT_SETTINGS)).toBe(JAPANESE_LEARNING_TARGET);
        expect(activeLearningTargetLanguage()).toBe('ja');

        expect(isLookupableTargetLanguageText('I read 日本語')).toBe(true);
        expect(isLookupableTargetLanguageText('한국어')).toBe(false);
        expect(targetOcrLanguageTag('')).toBe('ja-JP');
        expect(targetSpeechSynthesisLocale()).toBe('ja-JP');
        expect(targetContentLocale()).toBe('ja');
        expect(isTargetLanguageSubtitleTrack({ label: 'Japanese', kind: 'youtube', language: 'ja' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: 'Korean', kind: 'youtube', language: 'ko' })).toBe(false);
        expect(newTabCardReading(card('猫', 'ねこ'))).toBe('ねこ');
    });

    it('switches every one of those call sites when the profile names Korean', () => {
        expect(adoptLearningTargetFromSettings(settingsStoringTarget('ko'))).toBe(KOREAN_LEARNING_TARGET);
        expect(activeLearningTargetLanguage()).toBe('ko');

        // detection — the reader stops claiming Japanese text and starts
        // claiming Hangul, with no edit in lookup/text-helpers.
        expect(isLookupableTargetLanguageText('한국어')).toBe(true);
        expect(isLookupableTargetLanguageText('I read 日本語')).toBe(false);
        // OCR + speech synthesis
        expect(targetOcrLanguageTag('')).toBe('ko-KR');
        expect(targetSpeechSynthesisLocale()).toBe('ko-KR');
        // typography
        expect(targetContentLocale()).toBe('ko');
        // subtitles, including the aliases the Korean module declares
        expect(isTargetLanguageSubtitleTrack({ label: 'Korean', kind: 'youtube', language: 'ko' })).toBe(true);
        expect(isTargetLanguageSubtitleTrack({ label: 'Japanese', kind: 'youtube', language: 'ja' })).toBe(false);
        // SRS/mining reading normalization: the Japanese rule discards a
        // reading holding no Japanese script and falls back to the spelling.
        expect(newTabCardReading(card('한국', '하나'))).toBe('하나');
    });

    it('reaches a target registered out of tree, from storage alone', () => {
        registerLearningTargetModule(createLearningTargetModule({
            id: 'swahili-selection-test-target',
            language: 'sw',
            featureSemantics: {
                characterSystem: 'latin',
                phoneticScripts: ['latin'],
                pronunciation: 'none',
                readingAnnotation: 'none',
            },
            detectsText: /[A-Za-z]/u,
        }));

        expect(settingsStoringTarget('sw').languageProfiles[0]?.targetLanguage).toBe('sw');
        adoptLearningTargetFromSettings(settingsStoringTarget('sw'));

        expect(activeLearningTargetLanguage()).toBe('sw');
        expect(isLookupableTargetLanguageText('habari')).toBe(true);
        expect(targetSpeechSynthesisLocale()).toBe('sw-TZ');
    });

    it('lands on Japanese, not on the previous target, when storage is unusable', () => {
        adoptLearningTargetFromSettings(settingsStoringTarget('ko'));
        expect(activeLearningTargetLanguage()).toBe('ko');

        // Raw, un-normalized storage: the profile names a target this build
        // has no module for. Leaving Korean active would be the silent-strand
        // failure; Japanese is the only safe answer.
        expect(adoptLearningTargetFromSettings({
            activeLanguageProfileId: 'p1',
            languageProfiles: [{ ...createDefaultLanguageProfile(), id: 'p1', targetLanguage: 'qqq' }],
        })).toBe(JAPANESE_LEARNING_TARGET);
        expect(isLookupableTargetLanguageText('I read 日本語')).toBe(true);

        adoptLearningTargetFromSettings(settingsStoringTarget('ko'));
        expect(adoptLearningTargetFromSettings(null)).toBe(JAPANESE_LEARNING_TARGET);
        expect(adoptLearningTargetFromSettings(undefined)).toBe(JAPANESE_LEARNING_TARGET);
    });
});

// ---------------------------------------------------------------------------
// 3. The wiring itself. Without a caller the setter is dead code, which is
//    exactly the state these two tests exist to prevent returning to.
// ---------------------------------------------------------------------------

describe('the active target is wired to the profile at boot', () => {
    it('adopts the stored target while loading startup settings', async () => {
        storedSettings = settingsStoringTarget('ko');
        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);

        await loadReaderStartupSettings({ showWelcome: false });

        expect(activeLearningTarget()).toBe(KOREAN_LEARNING_TARGET);
        expect(isLookupableTargetLanguageText('한국어')).toBe(true);
    });

    it('leaves a default install on Japanese', async () => {
        storedSettings = DEFAULT_SETTINGS;
        await loadReaderStartupSettings({ showWelcome: false });

        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);
        expect(isLookupableTargetLanguageText('I read 日本語')).toBe(true);
    });
});

describe('onboarding chooses the definition language, not the target', () => {
    it('leaves an already-selected target alone when the learner language changes', async () => {
        let settings: ReaderSettings = normalizeReaderSettings({
            ...settingsStoringTarget('ko'),
            onboardingSeen: false,
            interfaceLanguage: 'en',
        });
        expect(settings.languageProfiles[0]?.targetLanguage).toBe('ko');

        const controller = new OnboardingController({
            getSettings: () => settings,
            setSettings: next => { settings = next; },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        });
        await controller.showIfNeeded();

        document.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!.value = 'fr';
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        const profile = settings.languageProfiles
            .find(candidate => candidate.id === settings.activeLanguageProfileId);
        expect(profile?.learnerLanguage).toBe('fr');
        // Re-stamping a constant here would silently revert what the person
        // is studying every time they touched their definition language.
        expect(profile?.targetLanguage).toBe('ko');
    });
});

describe('the active target follows a profile change while running', () => {
    function bind(settings: () => ReaderSettings): AbortController {
        const controller = new AbortController();
        bindReaderRuntimeEvents({
            applyTheme: () => undefined,
            clearBridgeCaches: () => undefined,
            getSettings: settings,
            isDestroyed: () => false,
            saveSettings: async () => undefined,
            setInterfaceLanguage: () => undefined,
            setSettings: () => undefined,
            showSettings: () => undefined,
        }, controller.signal);
        return controller;
    }

    it('re-adopts when a settings write announces a new target', () => {
        let settings = DEFAULT_SETTINGS;
        const controller = bind(() => settings);

        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings } }));
        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);

        settings = settingsStoringTarget('ko');
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings } }));

        expect(activeLearningTarget()).toBe(KOREAN_LEARNING_TARGET);
        expect(targetSpeechSynthesisLocale()).toBe('ko-KR');
        expect(isLookupableTargetLanguageText('한국어')).toBe(true);

        // ...and back again, so this is a live subscription rather than a
        // one-way latch.
        settings = DEFAULT_SETTINGS;
        window.dispatchEvent(new CustomEvent(SETTINGS_CHANGE_EVENT, { detail: { settings } }));

        expect(activeLearningTarget()).toBe(JAPANESE_LEARNING_TARGET);
        expect(isLookupableTargetLanguageText('I read 日本語')).toBe(true);
        controller.abort();
    });
});
