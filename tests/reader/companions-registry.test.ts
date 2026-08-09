import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    registerYomuCompanion,
    yomuImageOcrController,
    yomuNormalizeOcrRenderedText,
    yomuSettingsSurfaceCompanion,
    yomuSubtitlePlayerController,
    yomuVideoCompanionSlot,
} from '../../src/reader/companions/registry';

const companionDescriptor = () => Object.getOwnPropertyDescriptor(globalThis, '__yomuCompanions');
const originalCompanionSlots = {
    imageOcrController: yomuImageOcrController(),
    normalizeOcrRenderedText: yomuNormalizeOcrRenderedText(),
    settings: yomuSettingsSurfaceCompanion(),
    video: yomuVideoCompanionSlot(),
};

function restoreMutatedCompanionSlots(): void {
    const ImageOcrController = originalCompanionSlots.imageOcrController;
    if (ImageOcrController) {
        registerYomuCompanion('ocr', {
            ImageOcrController,
            normalizeOcrRenderedText: originalCompanionSlots.normalizeOcrRenderedText,
        });
    }
    if (originalCompanionSlots.video) registerYomuCompanion('video', originalCompanionSlots.video);
    if (originalCompanionSlots.settings) registerYomuCompanion('settings', originalCompanionSlots.settings);
}

describe('companion registry', () => {
    const originalDescriptor = companionDescriptor();

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        // registerYomuCompanion also updates the module-local Firefox fallback.
        // Restoring only this jsdom realm's descriptor leaves partial test slots
        // behind for the next file when Vitest reuses the module graph.
        restoreMutatedCompanionSlots();
        if (originalDescriptor) {
            Object.defineProperty(globalThis, '__yomuCompanions', originalDescriptor);
        } else {
            delete (globalThis as typeof globalThis & { __yomuCompanions?: unknown }).__yomuCompanions;
        }
    });

    it('keeps a sandbox registry when Firefox rejects cross-compartment assignment', () => {
        const Controller = class TestOcrController {};
        Object.defineProperty(globalThis, '__yomuCompanions', {
            configurable: true,
            get: () => undefined,
            set: () => { throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper'); },
        });

        expect(() => registerYomuCompanion('ocr', { ImageOcrController: Controller as never })).not.toThrow();

        expect(yomuImageOcrController()).toBe(Controller);
    });

    it('publishes companions to window when the userscript global differs', () => {
        const SubtitlePlayerController = class TestSubtitlePlayerController {};
        const YoutubeImmersionFilter = class TestYoutubeImmersionFilter {};
        const windowDescriptor = Object.getOwnPropertyDescriptor(window, '__yomuCompanions');
        delete (window as typeof window & { __yomuCompanions?: unknown }).__yomuCompanions;
        vi.stubGlobal('window', Object.create(window));

        registerYomuCompanion('video', {
            SubtitlePlayerController: SubtitlePlayerController as never,
            YoutubeImmersionFilter: YoutubeImmersionFilter as never,
        });

        expect((globalThis.window as typeof window & { __yomuCompanions?: Record<string, unknown> }).__yomuCompanions?.video).toBeDefined();
        delete (globalThis.window as typeof window & { __yomuCompanions?: unknown }).__yomuCompanions;
        expect(yomuSubtitlePlayerController()).toBe(SubtitlePlayerController);
        if (windowDescriptor) Object.defineProperty(window, '__yomuCompanions', windowDescriptor);
    });

    it('does not require defining a page-global registry when XrayWrapper rejects every write path', () => {
        const Controller = class TestOcrController {};
        Object.defineProperty(globalThis, '__yomuCompanions', {
            configurable: true,
            get: () => undefined,
            set: () => { throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper'); },
        });
        const defineProperty = vi.spyOn(Object, 'defineProperty').mockImplementation((target, key, descriptor) => {
            if (target === globalThis && key === '__yomuCompanions') {
                throw new Error('Not allowed to define cross-origin object as property on [Object] XrayWrapper');
            }
            if (!target || (typeof target !== 'object' && typeof target !== 'function')) return target;
            Reflect.defineProperty(target, key, descriptor);
            return target;
        });

        expect(() => registerYomuCompanion('ocr', { ImageOcrController: Controller as never })).not.toThrow();

        expect(defineProperty).toHaveBeenCalled();
        expect(yomuImageOcrController()).toBe(Controller);
    });

    it('exposes multilingual dictionary setup and definition translation through the settings companion', () => {
        const SettingsDialogController = class TestSettingsDialogController {};
        const LookupModalAccessibility = class TestLookupModalAccessibility {};
        const OnboardingController = class TestOnboardingController {};
        const installOfflineParsingDictionaries = vi.fn();
        const installDefinitionTranslationBehaviors = vi.fn();

        registerYomuCompanion('settings', {
            SettingsDialogController: SettingsDialogController as never,
            LookupModalAccessibility: LookupModalAccessibility as never,
            OnboardingController: OnboardingController as never,
            installOfflineParsingDictionaries: installOfflineParsingDictionaries as never,
            installDefinitionTranslationBehaviors: installDefinitionTranslationBehaviors as never,
            selfEnhancement: {
                SETTINGS_PARSE_TARGET_LIMIT: 120,
                nestedSettingsParseAlreadyRendered: vi.fn(),
                nestedSettingsTextParsePlan: vi.fn(),
                parsedSettingsTargetsForCurrentPlan: vi.fn(),
                supplementSettingsFallbackTokens: vi.fn(),
                addSettingsRubyFromRenderedReadings: vi.fn(),
                settingsForSettingsFormParse: vi.fn(),
            } as never,
        });

        expect(yomuSettingsSurfaceCompanion()).toMatchObject({
            SettingsDialogController,
            OnboardingController,
            installOfflineParsingDictionaries,
            installDefinitionTranslationBehaviors,
        });
    });

    it('restores every runtime slot mutated by the registry tests', () => {
        expect(yomuImageOcrController()).toBe(originalCompanionSlots.imageOcrController);
        expect(yomuNormalizeOcrRenderedText()).toBe(originalCompanionSlots.normalizeOcrRenderedText);
        expect(yomuSettingsSurfaceCompanion()).toBe(originalCompanionSlots.settings);
        expect(yomuVideoCompanionSlot()).toBe(originalCompanionSlots.video);
    });
});
