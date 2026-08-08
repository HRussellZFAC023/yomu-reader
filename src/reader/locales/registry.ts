import { ENGLISH_FALLBACK_MESSAGES, type LocaleMessageKey } from './catalog';
import { LOCALE_CATALOGS } from './catalogs';
import { copyTierOf, type CopyTier } from './copy-tiers';
import { JAPANESE_SETUP_MESSAGES } from './japanese-setup';
import { interfaceLocaleByTag } from './manifest';
import { isMessageId, legacyChromeMessageId, type MessageId } from './message-ids';
import type { MessagePack } from './resolve';

/**
 * D43 — the unified registry: the three localisation systems seen as one set of
 * message IDs, so coverage can be *measured* instead of asserted.
 *
 * The registry deliberately does not own the strings. It owns the ID vocabulary
 * and, for each locale, which IDs that locale can answer. The reader chrome keeps
 * its compact inline maps, the 32 catalogues keep their own files and owners, and
 * hosted docs keeps its prose map — the plan's "unify the pipeline, not the
 * content namespaces". What is unified is: one ID space, one tier policy, one
 * fallback chain, one validator, one coverage number per locale.
 *
 * Docs prose is measured by `tests/reader/locales/interface-locales.test.ts`
 * reading the theme map directly. It is not imported here: pulling a 3,662-entry
 * VitePress map into the userscript to count it would cost the reader bundle
 * more than the count is worth.
 */

export interface RegisteredMessage {
    readonly id: MessageId;
    readonly tier: CopyTier;
    readonly sourceText: string;
}

/** `setup.*` — the namespace the 32 machine-draft catalogues already fill. */
export function setupMessageIds(): readonly MessageId[] {
    return Object.keys(ENGLISH_FALLBACK_MESSAGES).map((key) => `setup.${key}` as MessageId);
}

export function setupMessageIdFor(key: LocaleMessageKey): MessageId {
    return `setup.${key}` as MessageId;
}

/**
 * The registry for one supplier of English source strings.
 *
 * `chromeSource` is passed in rather than imported so this module stays free of
 * `src/reader/app/i18n.ts`, which drags in network and constants code that the
 * hosted docs theme has no reason to load.
 */
function registerMessages(
    idOf: (key: string) => MessageId,
    source: Readonly<Record<string, string>>,
): readonly RegisteredMessage[] {
    return Object.entries(source).map(([key, sourceText]) => {
        const id = idOf(key);
        if (!isMessageId(id)) throw new Error(`Message key ${key} produced an invalid ID: ${id}`);
        return Object.freeze({ id, tier: copyTierOf(id, sourceText).tier, sourceText });
    });
}

export function registerChromeMessages(
    source: Readonly<Record<string, string>>,
): readonly RegisteredMessage[] {
    return registerMessages(legacyChromeMessageId, source);
}

export function registerSetupMessages(): readonly RegisteredMessage[] {
    return registerMessages((key) => `setup.${key}` as MessageId, ENGLISH_FALLBACK_MESSAGES);
}

/**
 * The `setup.*` pack for one locale.
 *
 * English and the 32 configured languages come from the catalogues; Japanese has
 * no catalogue row because it is the study target, not a learner language, so its
 * setup copy lives in `japanese-setup.ts`. Both are the same shape here, which is
 * the point of the pipeline being unified.
 */
export function setupPackFor(tag: string): MessagePack | undefined {
    // Accepts either a BCP-47 tag or a catalogue id: `yue-Hant` and `yue` are the
    // same locale, and only one of them is a catalogue file name.
    const id = interfaceLocaleByTag(tag)?.id ?? tag;
    const messages = id === 'ja'
        ? JAPANESE_SETUP_MESSAGES
        : (LOCALE_CATALOGS as Record<string, { messages: Record<string, string> } | undefined>)[id]
            ?.messages;
    if (!messages) return undefined;
    return Object.freeze(
        Object.fromEntries(
            Object.entries(messages).map(([key, value]) => [`setup.${key}`, value]),
        ),
    );
}

export interface LocaleCoverage {
    readonly tag: string;
    readonly humanCriticalTotal: number;
    readonly humanCriticalTranslated: number;
    readonly machineDraftOkTotal: number;
    readonly machineDraftOkTranslated: number;
    readonly complete: boolean;
}

/**
 * Measure one locale against the registered IDs it should be able to answer.
 *
 * `complete` means every human-critical ID resolves in this locale itself — not
 * via the fallback chain. That is the bar for offering the locale at all,
 * because falling back mid-sentence is exactly the silent English substitution
 * D43 forbids.
 */
export function measureLocaleCoverage(
    tag: string,
    registered: readonly RegisteredMessage[],
    pack: MessagePack | undefined,
): LocaleCoverage {
    let humanCriticalTotal = 0;
    let humanCriticalTranslated = 0;
    let machineDraftOkTotal = 0;
    let machineDraftOkTranslated = 0;
    for (const message of registered) {
        const translated = Boolean(pack?.[message.id]);
        if (message.tier === 'human-critical') {
            humanCriticalTotal += 1;
            if (translated) humanCriticalTranslated += 1;
        } else {
            machineDraftOkTotal += 1;
            if (translated) machineDraftOkTranslated += 1;
        }
    }
    return Object.freeze({
        tag,
        humanCriticalTotal,
        humanCriticalTranslated,
        machineDraftOkTotal,
        machineDraftOkTranslated,
        complete:
            humanCriticalTranslated === humanCriticalTotal
            && machineDraftOkTranslated === machineDraftOkTotal,
    });
}
