import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chromeMessageSource, chromeMessageSourceForLocale } from '../../../src/reader/app/i18n';
import {
    ENGLISH_INTERFACE_LOCALE,
    INTERFACE_LOCALES,
    LEARNER_LANGUAGE_IDS,
    RTL_GATE_ITEMS,
    RTL_INTERFACE_LOCALES,
    availableInterfaceLocales,
    blockedInterfaceLocales,
    interfaceLocaleByTag,
    legacyChromeMessageId,
    measureLocaleCoverage,
    registerChromeMessages,
    registerSetupMessages,
    resolveInterfaceLocale,
    resolveMessage,
    rtlGatePasses,
    setupPackFor,
    type MessagePack,
} from '../../../src/reader/locales';

const chromeRegistry = registerChromeMessages(chromeMessageSource());
const setupRegistry = registerSetupMessages();
const registry = [...chromeRegistry, ...setupRegistry];

function chromePackFor(tag: string): MessagePack | undefined {
    if (tag !== 'en' && tag !== 'ja') return undefined;
    return Object.freeze(
        Object.fromEntries(
            Object.entries(chromeMessageSourceForLocale(tag)).map(([key, value]) => [
                legacyChromeMessageId(key),
                value,
            ]),
        ),
    );
}

function fullPackFor(tag: string): MessagePack {
    return Object.freeze({ ...(chromePackFor(tag) ?? {}), ...(setupPackFor(tag) ?? {}) });
}

describe('D43 interface locale manifest', () => {
    it('covers the 32 configured languages plus Japanese, and nothing else', () => {
        const ids = INTERFACE_LOCALES.map((locale) => locale.id);
        const tags = INTERFACE_LOCALES.map((locale) => locale.tag);

        expect(ids).toHaveLength(33);
        expect(new Set(ids).size).toBe(33);
        expect(new Set(tags).size).toBe(33);
        for (const id of LEARNER_LANGUAGE_IDS) expect(ids, id).toContain(id);
        expect(ids).toContain('ja');
        // Five locales have a BCP-47 tag that is not their catalogue id, and both
        // keys must find the row or a locale resolves to messages it does not have.
        expect(interfaceLocaleByTag('yue')).toBe(interfaceLocaleByTag('yue-Hant'));
        expect(interfaceLocaleByTag('sh')).toBe(interfaceLocaleByTag('sr-Latn'));
        expect(interfaceLocaleByTag('tl')).toBe(interfaceLocaleByTag('fil'));
    });

    it('derives direction from the script, so a new Arabic-script locale cannot arrive marked ltr', () => {
        expect(RTL_INTERFACE_LOCALES.map((locale) => locale.tag).sort()).toEqual(['ar', 'fa']);
        for (const locale of INTERFACE_LOCALES) {
            if (locale.script === 'Arab') expect(locale.direction, locale.tag).toBe('rtl');
            else expect(locale.direction, locale.tag).toBe('ltr');
        }
    });

    it('gives every locale a fallback chain that ends at English', () => {
        for (const locale of INTERFACE_LOCALES) {
            if (locale.tag === 'en') {
                expect(locale.fallbacks).toEqual([]);
                continue;
            }
            expect(locale.fallbacks.at(-1), locale.tag).toBe('en');
        }
        // CLDR aliases and the catalogue id both sit in the chain, so a pack
        // keyed `sh` still answers for a locale whose Intl tag is `sr-Latn`.
        expect(interfaceLocaleByTag('sr-Latn')?.fallbacks).toEqual(['sr', 'sh', 'hr', 'bs', 'en']);
        expect(interfaceLocaleByTag('fil')?.fallbacks).toEqual(['tl', 'en']);
        expect(interfaceLocaleByTag('yue-Hant')?.fallbacks).toEqual(['yue', 'en']);
    });

    it('gives right-to-left scripts a font stack that actually ships the script', () => {
        for (const locale of RTL_INTERFACE_LOCALES) {
            expect(locale.fontStack, locale.tag).toContain('Arabic');
        }
        expect(ENGLISH_INTERFACE_LOCALE.fontStack).toContain('system-ui');
    });
});

describe('D43 availability is measured, not declared', () => {
    it('only marks a locale available when it can answer every registered message itself', () => {
        for (const locale of INTERFACE_LOCALES) {
            const coverage = measureLocaleCoverage(locale.tag, registry, fullPackFor(locale.tag));
            expect(coverage.complete, `${locale.tag} coverage vs ledger`).toBe(locale.available);
        }
    });

    it('ships exactly English and Japanese today, and names all 31 others as in scope', () => {
        expect(availableInterfaceLocales().map((locale) => locale.tag)).toEqual(['en', 'ja']);
        expect(blockedInterfaceLocales()).toHaveLength(31);
    });

    it('reports Arabic and Farsi as blocked on the RTL gate first', () => {
        for (const tag of ['ar', 'fa']) {
            const locale = interfaceLocaleByTag(tag);
            expect(locale?.available, tag).toBe(false);
            expect(locale?.blockers[0], tag).toBe('rtl-verification-pending');
        }
        // Every other blocked locale is blocked on translation, not on layout.
        for (const locale of blockedInterfaceLocales()) {
            if (locale.direction === 'rtl') continue;
            expect(locale.blockers[0], locale.tag).toBe('translation-incomplete');
        }
    });

    it('keeps the RTL gate honest: unfinished items are named and the gate does not pass', () => {
        expect(rtlGatePasses()).toBe(false);
        expect(RTL_GATE_ITEMS.length).toBeGreaterThanOrEqual(8);
        for (const item of RTL_GATE_ITEMS) {
            expect(item.note.length, item.id).toBeGreaterThan(20);
        }
        expect(RTL_GATE_ITEMS.filter((item) => item.done).map((item) => item.id)).toEqual([
            'direction-propagation',
            'font-stacks',
        ]);
        // Bidi isolation is deliberately NOT ticked. Substituted values are
        // isolated; the content spans chrome renders as their own elements are
        // not, and a half-done item ticked whole is how RTL gets discovered late.
        expect(RTL_GATE_ITEMS.find((item) => item.id === 'bidi-isolation')?.note)
            .toContain('HALF DONE');
    });

    it('measures a partly translated locale as incomplete rather than rounding it up', () => {
        // Arabic has all eleven setup strings and none of the 1,207 chrome ones.
        const arabic = measureLocaleCoverage('ar', registry, fullPackFor('ar'));

        expect(arabic.complete).toBe(false);
        expect(arabic.humanCriticalTranslated).toBeGreaterThan(0);
        expect(arabic.humanCriticalTranslated).toBeLessThan(arabic.humanCriticalTotal);
    });
});

describe('D43 resolution never substitutes English in silence', () => {
    it('honours an available locale exactly', () => {
        expect(resolveInterfaceLocale('ja')).toMatchObject({
            requested: 'ja',
            substituted: false,
            blockers: [],
        });
    });

    it('reports the substitution and the blockers when a stored value names a blocked locale', () => {
        // A profile written by a newer build, or an owner flipping the ledger
        // back, must not quietly produce English chrome with no explanation.
        const resolution = resolveInterfaceLocale('ar');

        expect(resolution.locale.tag).toBe('en');
        expect(resolution.substituted).toBe(true);
        expect(resolution.blockers).toContain('rtl-verification-pending');
    });

    it('resolves auto from browser preferences and falls back deterministically', () => {
        expect(resolveInterfaceLocale('auto', { browserLocales: ['ja-JP', 'en-US'] }).locale.tag).toBe('ja');
        expect(resolveInterfaceLocale('auto', { browserLocales: ['ar-EG'] }).locale.tag).toBe('en');
        expect(resolveInterfaceLocale('auto', { browserLocales: [] }).locale.tag).toBe('en');
        expect(resolveInterfaceLocale('ja-JP').locale.tag).toBe('ja');
    });

    it('falls back down the chain for a missing message instead of rendering a placeholder', () => {
        const japanese = interfaceLocaleByTag('ja')!;
        const packs = { ja: { 'chrome.only': 'ある' } as MessagePack, en: { 'chrome.other': 'Other' } as MessagePack };

        expect(resolveMessage('chrome.only', japanese, packs)).toMatchObject({
            value: 'ある',
            resolvedFrom: 'ja',
            missing: false,
        });
        expect(resolveMessage('chrome.other', japanese, packs)).toMatchObject({
            value: 'Other',
            resolvedFrom: 'en',
            missing: false,
        });
        expect(resolveMessage('chrome.absent', japanese, packs)).toMatchObject({
            value: 'chrome.absent',
            missing: true,
        });
    });

    it('has no 未翻訳 placeholder left in the reader chrome resolver', () => {
        // The old behaviour rendered this literal string for any Japanese key it
        // could not find, which reads to a learner as a broken app.
        expect(readFileSync('src/reader/app/i18n.ts', 'utf8')).not.toContain("'未翻訳'");
    });
});

describe('D43 the 32 machine-draft catalogues seed the pipeline', () => {
    it('serves every catalogue through the same setup.* namespace, Japanese included', () => {
        for (const locale of INTERFACE_LOCALES) {
            const pack = setupPackFor(locale.tag);
            expect(pack, locale.tag).toBeDefined();
            expect(Object.keys(pack!).every((id) => id.startsWith('setup.')), locale.tag).toBe(true);
            expect(Object.keys(pack!)).toHaveLength(setupRegistry.length);
        }
    });

    it('carries the blocker reason in the blocked locale own language', () => {
        for (const locale of blockedInterfaceLocales()) {
            const pack = setupPackFor(locale.tag)!;
            expect(pack['setup.interfaceRtlVerificationPending'], locale.tag).toBeTruthy();
            expect(pack['setup.interfaceTranslationPending'], locale.tag).toBeTruthy();
            // Not left as the English source string.
            if (locale.tag !== 'en') {
                expect(pack['setup.interfaceTranslationPending'], locale.tag)
                    .not.toBe('Translation is still in progress.');
            }
        }
    });
});
