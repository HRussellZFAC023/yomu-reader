/**
 * U46: a language-neutral, licence-carrying example-source contract.
 *
 * The shape this replaces was Japanese-only in three ways at once. Its provider
 * union was `bunpro | jiten | jpdb`, its media fields assumed an ImmersionKit
 * anime frame, and it carried no language, licence, attribution or provenance,
 * so nothing downstream could tell a Spanish sentence from a Japanese one or a
 * CC0 recording from one nobody may ship.
 *
 * The contract is deliberately **component-capable rather than a Boolean**.
 * "An ImmersionKit equivalent for the other 31 languages" does not exist: every
 * configured language has some Tatoeba text, twelve have no open sentence audio
 * at all, and all thirty-two lack a general licensed sentence-paired image
 * source. A single `hasExamples` flag would have to lie about one of those, so
 * text, audio and image each answer for themselves.
 */

/** The three assets an example can carry, each sourced and licensed separately. */
export type ExampleComponent = 'text' | 'audio' | 'image';

export type ExampleComponentAvailability =
    /** Wired, licensed, and expected to arrive with a result. */
    | 'available'
    /**
     * A source exists and every item must clear the licence allowlist on its
     * own. Tatoeba audio is contributor-licensed per file, so a language with
     * 849,774 audio rows can still return a page where none may be shipped.
     */
    | 'per-item'
    /** A source exists but no licence in it permits shipping. */
    | 'unlicensed'
    /** No source was found. This is a fact about supply, not a failure. */
    | 'none';

/**
 * What a media asset actually is. A word recording is not sentence audio and a
 * lemma photograph is not a scene frame; the plan forbids relabelling either,
 * so scope travels with the asset and with the capability that promised it.
 */
export type ExampleMediaScope = 'sentence' | 'term' | 'lemma-illustration';

/**
 * Every reason a component or a whole source can be less than fully present.
 * These map 1:1 onto localised copy, which is what makes the degradation
 * visible instead of an empty container.
 */
export type ExampleAvailabilityReason =
    | 'unsupported-target'
    | 'limited-corpus'
    | 'no-results'
    | 'no-licensed-audio'
    | 'no-sentence-audio-source'
    | 'no-image-source'
    | 'no-human-translation'
    | 'auth'
    | 'network'
    | 'schema';

export interface ExampleComponentCapability {
    readonly availability: ExampleComponentAvailability;
    /** Present whenever the component can arrive, so no caller has to guess. */
    readonly scope?: ExampleMediaScope;
    /** Why this component is not simply `available`. */
    readonly reason?: ExampleAvailabilityReason;
}

export interface ExampleSourceCapabilities {
    /** False when this adapter has nothing to say about this target at all. */
    readonly supported: boolean;
    readonly reason?: ExampleAvailabilityReason;
    readonly text: ExampleComponentCapability;
    readonly audio: ExampleComponentCapability;
    readonly image: ExampleComponentCapability;
    /**
     * `limited` marks a corpus small enough that an empty result is the normal
     * case rather than a defect. Lao has 229 sentences in total; a learner
     * deserves to be told that before concluding Yomu is broken.
     */
    readonly corpus: 'ample' | 'limited';
    /** Measured sentence-audio rows for this target, for honest UI copy. */
    readonly sentenceAudioRows?: number;
}

export interface MediaLicence {
    /** The licence as the source states it, e.g. `CC BY 4.0`. */
    readonly id: string;
    readonly commercialUse: boolean;
    readonly derivatives: boolean;
    readonly url?: string;
}

export interface LicensedMediaAsset {
    readonly kind: 'audio' | 'image';
    readonly scope: ExampleMediaScope;
    readonly url: string;
    readonly licence: MediaLicence;
    readonly attribution: string;
    /** Opens the precise record or file, not the site's front page. */
    readonly recordUrl?: string;
}

/** A media asset the licence allowlist refused, kept so the UI can say why. */
export interface WithheldMediaAsset {
    readonly kind: 'audio' | 'image';
    readonly licence: string;
    readonly reason: 'non-commercial' | 'no-derivatives' | 'missing-licence' | 'unknown-licence';
}

export interface ExampleText {
    readonly value: string;
    readonly language: string;
    readonly script?: string;
}

export interface ExampleTranslation {
    readonly value: string;
    readonly language: string;
    /**
     * `source` is a human translation the corpus already held. `machine` is one
     * Yomu produced. Merging these was how a machine gloss could be presented
     * as a native sentence pair.
     */
    readonly provenance: 'source' | 'machine';
    /** Tatoeba marks indirect (pivoted) translations; they are weaker evidence. */
    readonly direct?: boolean;
}

export interface ExampleSourceAttribution {
    readonly name: string;
    readonly url: string;
    readonly licence: string;
    readonly attribution: string;
}

export interface ExampleQuality {
    readonly nativeSpeaker?: boolean;
    readonly reviewed?: boolean;
    readonly warnings?: readonly string[];
}

export interface ExampleRecord {
    readonly id: string;
    readonly text: ExampleText;
    readonly translation?: ExampleTranslation;
    readonly audio?: readonly LicensedMediaAsset[];
    readonly image?: readonly LicensedMediaAsset[];
    readonly source: ExampleSourceAttribution;
    readonly quality?: ExampleQuality;
}

/**
 * `ProviderCollection` widened by exactly one state: `unsupported`.
 *
 * Without it, "this source has no sentences in your language" and "this source
 * broke" collapse into the same empty render, which is the A11 defect class the
 * backlog names — a state the learner cannot tell from broken.
 */
export type ExampleCollection<T> =
    | { availability: 'loaded'; items: T[]; withheldMedia?: readonly WithheldMediaAsset[] }
    | { availability: 'empty'; items: [] }
    | { availability: 'unsupported'; items: [] }
    | { availability: 'unavailable'; items: []; reason: 'auth' | 'network' | 'schema' };

export interface ExampleSearchRequest {
    readonly term: string;
    /** TARGET: the language of the sentence being searched for. */
    readonly targetLanguage: string;
    /** OUTPUT: the language its translation should arrive in. */
    readonly outputLanguage: string;
    readonly signal: AbortSignal;
    readonly limit?: number;
}

export interface ExampleSourceAdapter {
    readonly id: string;
    /** Label for the source card. Proper nouns stay untranslated. */
    readonly name: string;
    supports(targetLanguage: string): ExampleSourceCapabilities;
    search(request: ExampleSearchRequest): Promise<ExampleCollection<ExampleRecord>>;
}

/** Capability shorthand for a component with no source at all. */
export function noComponent(reason: ExampleAvailabilityReason): ExampleComponentCapability {
    return { availability: 'none', reason };
}

/**
 * The capability an adapter returns for a target it does not serve. Every
 * component is `none` for the same reason, so a caller cannot accidentally
 * render "no audio" as if text had worked.
 */
export function unsupportedCapabilities(): ExampleSourceCapabilities {
    return {
        supported: false,
        reason: 'unsupported-target',
        text: noComponent('unsupported-target'),
        audio: noComponent('unsupported-target'),
        image: noComponent('unsupported-target'),
        corpus: 'limited',
    };
}
