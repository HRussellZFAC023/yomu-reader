import interfaceLocaleLedger from '../../../config/multilingual/interface-locales.json';
import { LEARNER_LANGUAGES } from './roster';
import type { TextDirection, TranslationReviewStatus } from './types';

/**
 * D43 — one locale manifest, the single answer to "what can Yomu's interface be?".
 *
 * Everything a surface needs to render a locale correctly lives in one row: the
 * BCP-47 tag, the fallback chain, display names in both directions, script,
 * `dir`, a per-script font stack, review status, and — the part that matters
 * most for D43 — whether the locale may be SELECTED at all, and the reason when
 * it may not.
 *
 * The interface roster is the 32 configured languages in
 * `config/multilingual/languages.json` plus Japanese, which is a shipped
 * interface locale but not a learner-language row (it is the study target). That
 * is 33 human locales; `auto` is a preference, not a locale, and resolves to one
 * of the 33.
 *
 * Availability is NOT a free-text opinion. It comes from
 * `config/multilingual/interface-locales.json`, and
 * `tests/reader/locales/interface-locales.test.ts` re-measures every row against
 * the real message packs, so a locale cannot claim to be ready.
 */

export type InterfaceLocaleBlocker =
    | 'rtl-verification-pending'
    | 'translation-incomplete'
    | 'human-review-pending';

export interface InterfaceLocale {
    /**
     * BCP-47 tag as stored and as passed to `Intl` — `yue-Hant`, `sr-Latn`,
     * `fil`, not the roster id.
     */
    readonly tag: string;
    /**
     * The catalogue id: the key under `src/reader/locales/catalogs/` and in
     * `config/multilingual/languages.json`. Five of the 33 differ from the tag
     * (`yue`/`yue-Hant`, `zh`/`zh-Hans`, `mn`/`mn-Cyrl`, `sh`/`sr-Latn`,
     * `tl`/`fil`), and conflating the two is how a locale ends up with a correct
     * `Intl` tag and no messages.
     */
    readonly id: string;
    /** Deterministic fallback order after this locale, ending at `en`. */
    readonly fallbacks: readonly string[];
    readonly nativeName: string;
    readonly englishName: string;
    readonly script: string;
    readonly direction: TextDirection;
    /** Interface font stack for this script. Never applied to page content. */
    readonly fontStack: string;
    readonly reviewStatus: TranslationReviewStatus;
    /** True only when every blocker is cleared. */
    readonly available: boolean;
    readonly blockers: readonly InterfaceLocaleBlocker[];
}

const JAPANESE_INTERFACE_LOCALE = Object.freeze({
    id: 'ja',
    runtimeLocale: 'ja',
    englishName: 'Japanese',
    nativeName: '日本語',
    defaultScript: 'Jpan',
    direction: 'ltr' as TextDirection,
});

// Scripts whose text runs right to left. Kept as script codes rather than
// language tags so a future locale in the same script inherits the answer.
const RTL_SCRIPTS: ReadonlySet<string> = new Set(['Arab', 'Hebr', 'Thaa', 'Nkoo', 'Adlm', 'Syrc']);

// Interface font stacks by script. These style Yomu's own chrome only; page
// content and reader font settings are untouched. Each stack names the platform
// UI faces that actually ship the script, then a generic.
const SCRIPT_FONT_STACKS: Readonly<Record<string, string>> = Object.freeze({
    Latn: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    Grek: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    Cyrl: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    Arab: '"SF Arabic", "Geeza Pro", "Segoe UI", Tahoma, "Noto Naskh Arabic", system-ui, sans-serif',
    Jpan: 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", sans-serif',
    Hans: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    Hant: 'system-ui, -apple-system, "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif',
    Kore: 'system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif',
    Thai: 'system-ui, -apple-system, "Thonburi", "Leelawadee UI", "Noto Sans Thai", sans-serif',
    Laoo: 'system-ui, -apple-system, "Lao Sangam MN", "Leelawadee UI", "Noto Sans Lao", sans-serif',
    Khmr: 'system-ui, -apple-system, "Khmer Sangam MN", "Leelawadee UI", "Noto Sans Khmer", sans-serif',
    Mong: 'system-ui, -apple-system, "Noto Sans Mongolian", sans-serif',
});

const FALLBACK_FONT_STACK = SCRIPT_FONT_STACKS.Latn;

function scriptFontStack(script: string): string {
    return SCRIPT_FONT_STACKS[script] ?? FALLBACK_FONT_STACK;
}

function directionForScript(script: string): TextDirection {
    return RTL_SCRIPTS.has(script) ? 'rtl' : 'ltr';
}

interface LedgerRow {
    readonly tag: string;
    readonly reviewStatus: string;
    readonly rtlVerified: boolean;
    readonly available: boolean;
    readonly blockers: readonly string[];
}

const LEDGER_ROWS = new Map<string, LedgerRow>(
    (interfaceLocaleLedger.locales as readonly LedgerRow[]).map((row) => [row.tag, row]),
);

/**
 * Fallback chain: requested locale, then its language subtag if the request was
 * regional, then `en`. Serbo-Croatian and Filipino carry their CLDR aliases so a
 * stored `sr`/`hr`/`bs`/`fil` resolves rather than dropping straight to English.
 */
function fallbackChainFor(tag: string, id: string): readonly string[] {
    const chain: string[] = [];
    const push = (value: string) => {
        if (value !== tag && !chain.includes(value)) chain.push(value);
    };
    const base = tag.split('-')[0];
    push(base);
    // The catalogue id, so a pack keyed `sh` still answers for tag `sr-Latn`.
    push(id);
    if (id === 'sh') { push('sr'); push('hr'); push('bs'); }
    if (id === 'tl') push('fil');
    if (id !== 'en') push('en');
    return Object.freeze(chain);
}

function buildLocale(source: {
    id: string;
    runtimeLocale: string;
    englishName: string;
    nativeName: string;
    defaultScript: string;
    direction: TextDirection;
}): InterfaceLocale {
    const ledger = LEDGER_ROWS.get(source.id);
    if (!ledger) throw new Error(`Interface locale ${source.id} has no review-ledger row`);
    return Object.freeze({
        tag: source.runtimeLocale,
        id: source.id,
        fallbacks: fallbackChainFor(source.runtimeLocale, source.id),
        nativeName: source.nativeName,
        englishName: source.englishName,
        script: source.defaultScript,
        // languages.json and the script table must agree; the script is the
        // source of truth so one new RTL locale cannot arrive marked ltr.
        direction: directionForScript(source.defaultScript),
        fontStack: scriptFontStack(source.defaultScript),
        reviewStatus: ledger.reviewStatus as TranslationReviewStatus,
        available: ledger.available,
        blockers: Object.freeze([...ledger.blockers] as InterfaceLocaleBlocker[]),
    });
}

/** All 33 interface locales, English first, Japanese second, then by English name. */
export const INTERFACE_LOCALES: readonly InterfaceLocale[] = Object.freeze(
    [
        ...LEARNER_LANGUAGES.map((language) =>
            buildLocale({ ...language, direction: language.direction }),
        ),
        buildLocale(JAPANESE_INTERFACE_LOCALE),
    ].sort((left, right) => {
        const rank = (tag: string) => (tag === 'en' ? 0 : tag === 'ja' ? 1 : 2);
        return rank(left.tag) - rank(right.tag)
            || left.englishName.localeCompare(right.englishName, 'en');
    }),
);

// Both keys resolve, because both are stored somewhere: the roster id in
// language profiles and catalogues, the BCP-47 tag in `lang` attributes and
// `Intl` calls. The tag wins on a collision, which cannot occur today.
const LOCALE_BY_KEY = new Map<string, InterfaceLocale>([
    ...INTERFACE_LOCALES.map((locale) => [locale.id, locale] as const),
    ...INTERFACE_LOCALES.map((locale) => [locale.tag, locale] as const),
]);

export function interfaceLocaleByTag(tag: string): InterfaceLocale | undefined {
    return LOCALE_BY_KEY.get(tag);
}

export const ENGLISH_INTERFACE_LOCALE: InterfaceLocale = (() => {
    const english = LOCALE_BY_KEY.get('en');
    if (!english) throw new Error('The interface manifest must always contain English');
    return english;
})();

/** Locales a learner may actually select today. */
export function availableInterfaceLocales(): readonly InterfaceLocale[] {
    return INTERFACE_LOCALES.filter((locale) => locale.available);
}

/** Locales in scope but blocked, each with the reason to show. */
export function blockedInterfaceLocales(): readonly InterfaceLocale[] {
    return INTERFACE_LOCALES.filter((locale) => !locale.available);
}

export const RTL_INTERFACE_LOCALES: readonly InterfaceLocale[] = Object.freeze(
    INTERFACE_LOCALES.filter((locale) => locale.direction === 'rtl'),
);

export interface RtlGateItem {
    readonly id: string;
    readonly done: boolean;
    readonly note: string;
}

/** The RTL gate, item by item, so what is unfinished is named rather than assumed. */
export const RTL_GATE_ITEMS: readonly RtlGateItem[] = Object.freeze(
    (interfaceLocaleLedger.rtlGate.items as readonly RtlGateItem[]).map((item) =>
        Object.freeze({ ...item }),
    ),
);

export function rtlGatePasses(): boolean {
    return RTL_GATE_ITEMS.every((item) => item.done);
}
