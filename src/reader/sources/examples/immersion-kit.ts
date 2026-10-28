import type { ImmersionKitExample } from '../../immersion/kit';
import type {
    ExampleCollection,
    ExampleRecord,
    ExampleSearchRequest,
    ExampleSourceAdapter,
    ExampleSourceCapabilities,
    LicensedMediaAsset,
} from './types';
import { unsupportedCapabilities } from './types';

export const IMMERSION_KIT_EXAMPLE_SOURCE_ID = 'immersion-kit';

/**
 * ImmersionKit is the Japanese half of the U46 contract.
 *
 * The Japanese runtime path is deliberately untouched: the popover still mounts
 * `[data-immersion-kit]` and `ImmersionPopoverController` still renders it, with
 * the same carousel, audio and frame behaviour it has shipped for months. What
 * this file adds is the same *contract* answer for Japanese that Tatoeba gives
 * for the other 32, so nothing downstream has to special-case a language to ask
 * what a target actually has.
 *
 * The live, load-bearing use is the negative one. The definition stack used to
 * mount the ImmersionKit card whenever the feature was enabled, whatever the
 * learner was reading, so a Spanish target got a Japanese anime-subtitle search
 * that could only ever come back empty — indistinguishable from broken. Asking
 * this adapter first turns that into a visible "no Spanish sentences here" row.
 */
export function immersionKitCapabilitiesFor(targetLanguage: string): ExampleSourceCapabilities {
    const base = targetLanguage.trim().toLowerCase().split(/[-_]/u)[0];
    if (base !== 'ja') return unsupportedCapabilities();
    return {
        supported: true,
        text: { availability: 'available', scope: 'sentence' },
        audio: { availability: 'available', scope: 'sentence' },
        // The one paired scene image in the product. No non-Japanese target has
        // an equivalent; see `tatoeba.ts`.
        image: { availability: 'available', scope: 'sentence' },
        corpus: 'ample',
    };
}

export interface ImmersionKitSearcher {
    (term: string, signal: AbortSignal): Promise<ImmersionKitExample[]>;
}

export function createImmersionKitExampleSource(searcher: ImmersionKitSearcher): ExampleSourceAdapter {
    return {
        id: IMMERSION_KIT_EXAMPLE_SOURCE_ID,
        name: 'Immersion Kit',
        supports: immersionKitCapabilitiesFor,
        async search(request: ExampleSearchRequest): Promise<ExampleCollection<ExampleRecord>> {
            if (!immersionKitCapabilitiesFor(request.targetLanguage).supported) {
                return { availability: 'unsupported', items: [] };
            }
            const examples = await searcher(request.term, request.signal);
            const items = examples.map(immersionExampleToRecord);
            return items.length ? { availability: 'loaded', items } : { availability: 'empty', items: [] };
        },
    };
}

/**
 * Maps the ImmersionKit-shaped entity onto the neutral record without losing
 * anything the Japanese UI already shows: the furigana-bearing sentence, the
 * source title and category, the clip audio and the frame.
 *
 * Media licence: ImmersionKit serves excerpts of commercial media from its own
 * host, and Yomu links rather than redistributes them. That is not an open
 * licence, so these assets deliberately do **not** go through the CC allowlist
 * in `licence.ts` — routing them through it would reject every one of them and
 * silently delete the Japanese feature. The licence field says what the asset
 * actually is instead of borrowing a Creative Commons label it does not have.
 */
export function immersionExampleToRecord(example: ImmersionKitExample): ExampleRecord {
    const provider = example.provider ?? 'immersion-kit';
    const attribution = example.sourceTitle || example.titleSlug || 'Immersion Kit';
    return {
        id: `${provider}:${example.id || example.soundFile || example.sentence}`,
        text: { value: example.sentence, language: 'ja', script: 'Jpan' },
        ...(example.translation
            // ImmersionKit ships the official English subtitle line, which is a
            // human translation, not a machine one.
            ? { translation: { value: example.translation, language: 'en', provenance: 'source' as const, direct: true } }
            : {}),
        ...(example.soundUrl || example.soundFile
            ? { audio: [hostedAsset('audio', example.soundUrl || example.soundFile, attribution)] }
            : {}),
        ...(example.imageUrl || example.imageFile
            ? { image: [hostedAsset('image', example.imageUrl || example.imageFile, attribution)] }
            : {}),
        source: {
            name: provider === 'nadeshiko' ? 'Nadeshiko' : 'Immersion Kit',
            url: example.titleSlug ? `https://www.immersionkit.com/dictionary?keyword=${encodeURIComponent(example.sentence)}` : 'https://www.immersionkit.com/',
            licence: 'source-hosted media',
            attribution,
        },
        quality: { nativeSpeaker: true, reviewed: true },
    };
}

function hostedAsset(kind: 'audio' | 'image', url: string, attribution: string): LicensedMediaAsset {
    return {
        kind,
        scope: 'sentence',
        url,
        licence: { id: 'source-hosted media', commercialUse: false, derivatives: false },
        attribution,
    };
}
