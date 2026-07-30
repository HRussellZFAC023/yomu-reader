import type { MediaLicence, WithheldMediaAsset } from './types';

/**
 * The media licence allowlist.
 *
 * Yomu ships to browser stores and to a userscript channel, so a media asset is
 * only usable when the licence permits commercial redistribution and
 * derivatives. Tatoeba states the licence per audio file, chosen by whoever
 * recorded it, which is why this is an item-level gate and not a per-language
 * flag.
 *
 * Measured on 2026-07-29 against `api.tatoeba.org/v1/sentences` with
 * `include=audios`, 42 audio rows sampled across 20 languages: 27 were
 * `CC BY-NC-ND 3.0` (the manythings.org contributor set, which dominates
 * English), 8 carried no licence field at all, 3 were `CC BY-NC 4.0`, and 4 were
 * `CC BY 4.0`. Four of forty-two. That is why the plan's audio-row counts
 * describe supply rather than usable audio, and why "examples found but no
 * licensed audio" had to become a visible state instead of an empty slot.
 *
 * Families are matched without their version. A jurisdiction port or a point
 * release of CC BY does not change whether Yomu may ship the file, and pinning
 * every version would silently refuse an asset the moment Tatoeba writes
 * `CC BY 4.1`.
 */
const ALLOWED_LICENCE_FAMILIES: ReadonlyMap<string, string> = new Map([
    ['cc0', 'https://creativecommons.org/publicdomain/zero/1.0/'],
    ['by', 'https://creativecommons.org/licenses/by/4.0/'],
    ['by-fr', 'https://creativecommons.org/licenses/by/2.0/fr/'],
    ['by-sa', 'https://creativecommons.org/licenses/by-sa/4.0/'],
    ['public-domain', ''],
]);

export type MediaLicenceDecision =
    | { allowed: true; licence: MediaLicence }
    | { allowed: false; withheld: WithheldMediaAsset['reason'] };

/**
 * Decides one asset. An unrecognised string is refused rather than guessed: a
 * licence this build has never seen is exactly the case where optimism ships
 * something Yomu has no right to.
 */
export function decideMediaLicence(raw: unknown): MediaLicenceDecision {
    const stated = typeof raw === 'string' ? raw.trim() : '';
    if (!stated) return { allowed: false, withheld: 'missing-licence' };
    const family = licenceFamily(stated);
    const url = ALLOWED_LICENCE_FAMILIES.get(family);
    if (url !== undefined) {
        return { allowed: true, licence: { id: stated, commercialUse: true, derivatives: true, ...(url ? { url } : {}) } };
    }
    if (family.split('-').includes('nd')) return { allowed: false, withheld: 'no-derivatives' };
    if (family.split('-').includes('nc')) return { allowed: false, withheld: 'non-commercial' };
    return { allowed: false, withheld: 'unknown-licence' };
}

export function allowedMediaLicenceFamilies(): readonly string[] {
    return Object.freeze([...ALLOWED_LICENCE_FAMILIES.keys()]);
}

/** `CC BY-NC-ND 3.0` -> `by-nc-nd`; `CC0 1.0` -> `cc0`; version dropped. */
export function licenceFamily(value: string): string {
    return value
        .toLowerCase()
        .replace(/creative\s+commons/gu, 'cc')
        .split(/[^a-z0-9]+/u)
        .filter(part => part && part !== 'cc' && !/^\d/u.test(part))
        .join('-');
}
