import {
    ENGLISH_INTERFACE_LOCALE,
    INTERFACE_LOCALES,
    interfaceLocaleByTag,
    type InterfaceLocale,
    type InterfaceLocaleBlocker,
} from './manifest';
import type { MessageId } from './message-ids';

/**
 * D43 — deterministic locale and message resolution.
 *
 * Two rules the older behaviour broke:
 *
 *  1. **A blocked locale is never silently swapped for English.** The picker
 *     does not offer one, and if a stored value names one anyway — a profile
 *     written by a newer build, or an owner flipping the ledger back — the
 *     resolution result says so (`substituted`, `blockers`) so the surface can
 *     tell the learner instead of quietly speaking the wrong language.
 *  2. **A missing message falls back, it does not render a placeholder.** The
 *     old reader returned the literal string `未翻訳` for any Japanese key it
 *     could not find. Resolution now walks requested locale → language subtag →
 *     `en` and reports which locale answered, so an untranslated string reads as
 *     English rather than as a bug.
 */

export interface InterfaceLocaleResolution {
    /** The locale whose messages will actually be used. */
    readonly locale: InterfaceLocale;
    /** What the caller asked for, verbatim, including `auto`. */
    readonly requested: string;
    /** True when the request could not be honoured. Surface this. */
    readonly substituted: boolean;
    /** Why the request could not be honoured. Empty when it could. */
    readonly blockers: readonly InterfaceLocaleBlocker[];
}

export interface ResolveInterfaceLocaleOptions {
    /** Ordered browser preferences, used only for `auto`. */
    readonly browserLocales?: readonly string[];
}

function matchAvailable(tag: string): InterfaceLocale | undefined {
    const locale = interfaceLocaleByTag(tag);
    if (locale?.available) return locale;
    const base = tag.split('-')[0].toLowerCase();
    const byBase = interfaceLocaleByTag(base);
    if (byBase?.available) return byBase;
    // Aliases the manifest records as fallbacks (sr/hr/bs → sh, fil → tl).
    return INTERFACE_LOCALES.find(
        (candidate) => candidate.available && candidate.fallbacks.includes(base),
    );
}

export function resolveInterfaceLocale(
    requested: string | null | undefined,
    options: ResolveInterfaceLocaleOptions = {},
): InterfaceLocaleResolution {
    const raw = (requested ?? 'auto').trim();
    if (!raw || raw === 'auto') {
        for (const preference of options.browserLocales ?? []) {
            const match = typeof preference === 'string' ? matchAvailable(preference) : undefined;
            if (match) {
                return { locale: match, requested: 'auto', substituted: false, blockers: [] };
            }
        }
        return {
            locale: ENGLISH_INTERFACE_LOCALE,
            requested: 'auto',
            substituted: false,
            blockers: [],
        };
    }

    const exact = interfaceLocaleByTag(raw);
    if (exact?.available) {
        return { locale: exact, requested: raw, substituted: false, blockers: [] };
    }
    if (exact) {
        // In scope, but the ledger says it is not ready. Say so.
        return {
            locale: matchAvailable(raw) ?? ENGLISH_INTERFACE_LOCALE,
            requested: raw,
            substituted: true,
            blockers: exact.blockers,
        };
    }
    const byFallback = matchAvailable(raw);
    if (byFallback) {
        return { locale: byFallback, requested: raw, substituted: false, blockers: [] };
    }
    return {
        locale: ENGLISH_INTERFACE_LOCALE,
        requested: raw,
        substituted: true,
        blockers: [],
    };
}

/** A namespace pack: message IDs to strings, for exactly one locale. */
export type MessagePack = Readonly<Record<string, string>>;

export interface MessageLookup {
    readonly id: MessageId;
    readonly value: string;
    /** Which locale actually supplied the string. */
    readonly resolvedFrom: string;
    /** True when no locale in the chain had it — the ID itself is returned. */
    readonly missing: boolean;
}

/**
 * Walk `locale → fallbacks → en`. The chain is data from the manifest, so a
 * regional locale, a CLDR alias and a plain language tag all resolve the same
 * way on every surface.
 */
export function resolveMessage(
    id: MessageId,
    locale: InterfaceLocale,
    packs: Readonly<Record<string, MessagePack | undefined>>,
): MessageLookup {
    for (const tag of [locale.tag, ...locale.fallbacks]) {
        const value = packs[tag]?.[id];
        if (typeof value === 'string' && value.length > 0) {
            return { id, value, resolvedFrom: tag, missing: false };
        }
    }
    // Returning the ID is deliberate: it is searchable, it names the gap, and it
    // is never mistaken for copy the way `未翻訳` was.
    return { id, value: id, resolvedFrom: 'none', missing: true };
}
