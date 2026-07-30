import catalogue from '../../../config/multilingual/lookup-links.json';
import type { DictionaryLookupLink } from '../app/types';

/**
 * U46: per-target lookup hotlinks, as data.
 *
 * The owner's direction was "find existing websites and hotlink to it like we do
 * for immersion kit". So this ships no adapters, no mirrors and no licensing
 * surface — every entry is a plain `DictionaryLookupLink.urlTemplate` with a
 * query token in it, exactly the shape `jisho.org/search/{query}` has had since
 * the first Japanese default. `{queryAscii}` is reserved for sites whose path
 * slug strips diacritics even though their displayed headword keeps them.
 *
 * Two rules keep it data rather than code:
 *
 * 1. **A shared site reaches a target only if the target lists that site's
 *    code.** There is no per-language `if` anywhere. Absence of a code IS the
 *    opt-out, and every absence is a measured one: YouGlish silently serves
 *    English for a language it does not have (`pronounce/hund/danish` returns
 *    "110 pronunciations of Hund in English"), Linguee's two-letter codes
 *    silently serve German (`english-da` renders `[de] German`), Reverso and
 *    WordReference have no Danish/Finnish/Hungarian pair. Every one of those is
 *    expressed by leaving a key out of `codes`.
 * 2. **Japanese is not in the catalogue at all.** `ja` keeps
 *    `DEFAULT_DICTIONARY_LOOKUP_LINKS` untouched, so no Japanese install sees a
 *    changed pill row, a changed order, or a changed enabled flag.
 *
 * Script trap worth keeping in view: words.hk and CantoWords are
 * traditional-only (`食饭` 404s on both), which is why Cantonese is rostered as
 * `yue-Hant`. A simplified query into those two pills will legitimately miss.
 */

/** What a site actually hands the learner. Claimed only where it was measured. */
export type LookupLinkComponent = 'definition' | 'sentences' | 'audio' | 'images';

const LOOKUP_LINK_COMPONENTS: readonly LookupLinkComponent[] = Object.freeze([
    'definition', 'sentences', 'audio', 'images',
]);

interface SharedLookupSite {
    readonly id: string;
    readonly label: string;
    /** Key into a target's `codes` map. Presence there is the opt-in. */
    readonly code: string;
    readonly urlTemplate: string;
    readonly components: readonly LookupLinkComponent[];
    readonly enabled: boolean;
}

interface NativeLookupSite {
    readonly id: string;
    readonly label: string;
    readonly urlTemplate: string;
    readonly components: readonly LookupLinkComponent[];
}

interface TargetLookupEntry {
    readonly codes: Readonly<Record<string, string>>;
    readonly links: readonly NativeLookupSite[];
}

interface LookupLinkCatalogue {
    readonly schemaVersion: number;
    readonly shared: readonly SharedLookupSite[];
    readonly targets: Readonly<Record<string, TargetLookupEntry>>;
}

const CATALOGUE = catalogue as LookupLinkCatalogue;
const TARGET_LOOKUP_LINK_IDS = new Set([
    ...CATALOGUE.shared.map(site => site.id),
    ...Object.values(CATALOGUE.targets).flatMap(entry => entry.links.map(site => site.id)),
]);

const CODE_TOKEN = /%code%/g;

export interface TargetLookupSite {
    readonly id: string;
    readonly label: string;
    readonly urlTemplate: string;
    readonly components: readonly LookupLinkComponent[];
    readonly enabled: boolean;
    /** `native` sites are the target's own lexicography; `shared` are cross-language. */
    readonly origin: 'native' | 'shared';
}

export function hasTargetLookupSites(targetLanguage: string): boolean {
    return Object.hasOwn(CATALOGUE.targets, targetLanguage);
}

export function targetLookupSiteIds(): readonly string[] {
    return Object.keys(CATALOGUE.targets);
}

/** Whether an id belongs to a built-in row for any non-Japanese target. */
export function isTargetLookupLinkId(id: string): boolean {
    return TARGET_LOOKUP_LINK_IDS.has(id);
}

/**
 * The verified sites for one target, native lexicography first.
 *
 * Native first because that is the order the Japanese default already uses
 * (Yomu and Jiten before Wiktionary), and because a learner reaching for a pill
 * wants their language's own dictionary before a cross-language aggregator.
 */
export function targetLookupSites(targetLanguage: string): readonly TargetLookupSite[] {
    const entry = CATALOGUE.targets[targetLanguage];
    if (!entry) return [];
    const natives: TargetLookupSite[] = entry.links.map((site, index) => ({
        ...site,
        // The target's best-attested dictionary is on by default; the rest of its
        // shelf is one checkbox away.
        enabled: index === 0,
        origin: 'native',
    }));
    const shared: TargetLookupSite[] = [];
    for (const site of CATALOGUE.shared) {
        const code = entry.codes[site.code];
        if (!code) continue;
        shared.push({
            id: site.id,
            label: site.label,
            urlTemplate: site.urlTemplate.replace(CODE_TOKEN, code),
            components: site.components,
            enabled: site.enabled,
            origin: 'shared',
        });
    }
    return [...natives, ...shared];
}

/** The lookup links for one target, minus the Yomu and Copy pills the caller owns. */
export function targetLookupLinks(targetLanguage: string): DictionaryLookupLink[] {
    return targetLookupSites(targetLanguage).map(site => ({
        id: site.id,
        label: site.label,
        urlTemplate: site.urlTemplate,
        enabled: site.enabled,
    }));
}

/** Components a single site offers, for the editor note beside its row. */
export function lookupSiteComponents(targetLanguage: string, linkId: string): readonly LookupLinkComponent[] {
    return targetLookupSites(targetLanguage).find(site => site.id === linkId)?.components ?? [];
}

/**
 * Which components no site in this target's set can supply.
 *
 * This is the reversal U46 asks for, applied to the link sets: a target with no
 * image site says "no image source" instead of quietly offering a shorter list
 * that looks identical to a shorter list caused by a bug. Ancient Greek has no
 * pronunciation site and only Chinese has an image one, and a learner is owed
 * both facts up front.
 */
export function missingLookupComponents(targetLanguage: string): readonly LookupLinkComponent[] {
    if (!hasTargetLookupSites(targetLanguage)) return [];
    const present = new Set(targetLookupSites(targetLanguage).flatMap(site => site.components));
    return LOOKUP_LINK_COMPONENTS.filter(component => !present.has(component));
}
