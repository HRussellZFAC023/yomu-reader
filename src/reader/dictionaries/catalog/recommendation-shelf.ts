import shelfJson from '../../../../config/dictionaries/recommendation-shelf.v1.json';
import { googleTranslationLanguageCapability } from '../../translation/google';
import {
    DICTIONARY_CATALOG_SCHEMA_VERSION,
    DICTIONARY_CATALOG_TARGET_LANGUAGE,
    type DictionaryCatalogManifest,
    type DictionaryRecommendation,
    type DictionaryRecommendationManifest,
    type RecommendationRole,
    type Slice1LearnerLanguage,
} from './types';

/**
 * Slice 1 seeded three roles — bilingual terms, names, kanji — because that was
 * all the frozen acquisition list held. The mirror now publishes the rest of a
 * reading shelf, so the recommendation for a learner language covers Japanese
 * monolingual, grammar, frequency, pitch and examples too.
 *
 * The picks live in config/dictionaries/recommendation-shelf.v1.json beside the
 * other frozen inputs: the published manifests are a generated artefact, and
 * this module is the generator both the release pipeline and the conformance
 * test run, so no one has to hand-edit 32 JSON files to change a curation call.
 */
export interface RecommendationShelfSlot {
    role: RecommendationRole;
    priority: number;
    dictionaryId: string;
    selectedByDefault: boolean;
    /** False for lists with no prose to translate (frequency, pitch). */
    offerTranslation: boolean;
}

const STARTER_ROLES: ReadonlySet<RecommendationRole> = new Set<RecommendationRole>([
    'primary-terms',
    'fallback-terms',
    'names',
    'kanji',
]);

const SHELF_ROLES: ReadonlySet<string> = new Set<RecommendationRole>([
    'monolingual',
    'grammar',
    'frequency',
    'pronunciation',
    'examples',
]);

export const RECOMMENDATION_SHELF_SLOTS: readonly RecommendationShelfSlot[] = parseShelf(shelfJson);

/**
 * Returns the manifest with every shelf slot the catalogue can actually serve
 * appended. Slots whose dictionary is absent or not yet mirrored are skipped,
 * so the pre-release manifests (13 source-only entries) stay valid and only a
 * published catalogue grows the recommendation.
 */
export function extendRecommendationManifest(
    manifest: DictionaryRecommendationManifest,
    catalog: DictionaryCatalogManifest,
): DictionaryRecommendationManifest {
    const entryById = new Map(catalog.entries.map(entry => [entry.id, entry]));
    const seeded = new Set(manifest.dictionaries.map(dictionary => dictionary.dictionaryId));
    const starter = manifest.dictionaries.filter(dictionary => STARTER_ROLES.has(dictionary.role));
    const added: DictionaryRecommendation[] = [];
    for (const slot of RECOMMENDATION_SHELF_SLOTS) {
        if (seeded.has(slot.dictionaryId)) continue;
        const entry = entryById.get(slot.dictionaryId);
        if (!entry || entry.distribution.state !== 'published') continue;
        if (!entry.headwordLanguages.includes(catalog.targetLanguage)) continue;
        seeded.add(slot.dictionaryId);
        const definitionLanguage = entry.definitionLanguages[0] ?? catalog.targetLanguage;
        added.push({
            dictionaryId: slot.dictionaryId,
            role: slot.role,
            priority: slot.priority,
            selectedByDefault: slot.selectedByDefault,
            definitionLanguage,
            translationMode: shelfTranslationMode(manifest.learnerLanguage, definitionLanguage, slot),
        });
    }
    return {
        ...manifest,
        dictionaries: [...starter, ...added].sort((left, right) => left.priority - right.priority),
    };
}

/**
 * A frequency or pitch list has no sentences to translate, and a definition
 * already written in the learner's language must not be re-translated. Whether
 * the learner language can be machine-translated at all is the translation
 * adapter's answer, not a hardcoded list of exceptions.
 */
function shelfTranslationMode(
    learnerLanguage: Slice1LearnerLanguage,
    definitionLanguage: string,
    slot: RecommendationShelfSlot,
): DictionaryRecommendation['translationMode'] {
    if (!slot.offerTranslation) return 'off';
    if (definitionLanguage === learnerLanguage) return 'off';
    return googleTranslationLanguageCapability(learnerLanguage).supported ? 'offer' : 'off';
}

function parseShelf(input: unknown): readonly RecommendationShelfSlot[] {
    const root = input as {
        schemaVersion?: unknown;
        targetLanguage?: unknown;
        slots?: unknown;
    };
    if (root.schemaVersion !== DICTIONARY_CATALOG_SCHEMA_VERSION) {
        throw new Error('Recommendation shelf schemaVersion must equal 1.');
    }
    if (root.targetLanguage !== DICTIONARY_CATALOG_TARGET_LANGUAGE) {
        throw new Error('Recommendation shelf targetLanguage must equal ja.');
    }
    if (!Array.isArray(root.slots) || !root.slots.length) {
        throw new Error('Recommendation shelf must declare at least one slot.');
    }
    const slots = root.slots.map((slot, index) => parseSlot(slot, index));
    const roles = new Set(slots.map(slot => slot.role));
    if (roles.size !== slots.length) throw new Error('Recommendation shelf roles must be unique.');
    for (let index = 1; index < slots.length; index += 1) {
        if (slots[index - 1]!.priority >= slots[index]!.priority) {
            throw new Error('Recommendation shelf slots must be ordered by ascending priority.');
        }
    }
    return Object.freeze(slots);
}

function parseSlot(input: unknown, index: number): RecommendationShelfSlot {
    const slot = input as Partial<RecommendationShelfSlot> & { role?: string };
    const label = `Recommendation shelf slot ${index}`;
    if (typeof slot.role !== 'string' || !SHELF_ROLES.has(slot.role)) {
        throw new Error(`${label} must name a shelf role outside the bilingual starter.`);
    }
    if (typeof slot.dictionaryId !== 'string' || !slot.dictionaryId) {
        throw new Error(`${label} must name a catalogue dictionary.`);
    }
    if (!Number.isSafeInteger(slot.priority) || Number(slot.priority) <= 30) {
        throw new Error(`${label} must sort after the starter roles (priority > 30).`);
    }
    if (typeof slot.selectedByDefault !== 'boolean' || typeof slot.offerTranslation !== 'boolean') {
        throw new Error(`${label} must declare selectedByDefault and offerTranslation.`);
    }
    return Object.freeze({
        role: slot.role as RecommendationRole,
        priority: Number(slot.priority),
        dictionaryId: slot.dictionaryId,
        selectedByDefault: slot.selectedByDefault,
        offerTranslation: slot.offerTranslation,
    });
}
