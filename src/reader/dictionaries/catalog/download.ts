import type { DictionaryCatalogEntry, DictionaryCatalogManifest } from './types';

/**
 * Where a catalogue row's archive actually comes from, and what Settings may
 * promise about it.
 *
 * Two kinds of row install today. A `published` row is served by Yomu's mirror
 * from a content-addressed key, so the download carries a digest and a byte
 * count and the import path verifies both. An `upstream` row is served by the
 * publishing project itself — that is how a language gets a shelf before
 * anything has been mirrored for it — and its URL names the project's current
 * build, so there is no digest to pin and `sha256` is absent by construction
 * rather than by omission.
 *
 * Resolving that here, once, is what stops every card builder from re-deciding
 * it: a caller asks for the download and gets exactly the facts that are true.
 */
export interface DictionaryEntryDownload {
    url: string;
    /** Present only for mirror-served archives, which are content-addressed. */
    sha256?: string;
    /** Exact for a mirrored object; the observed upstream size otherwise. */
    bytes?: number;
    /** True when Yomu serves the bytes and can therefore verify them. */
    mirrored: boolean;
}

export function dictionaryEntryDownload(
    entry: DictionaryCatalogEntry,
    objectsBaseUrl: DictionaryCatalogManifest['objectsBaseUrl'],
): DictionaryEntryDownload | undefined {
    const distribution = entry.distribution;
    if (distribution.state === 'published') {
        return {
            url: new URL(distribution.object.key, objectsBaseUrl).href,
            sha256: distribution.object.sha256,
            bytes: distribution.object.bytes,
            mirrored: true,
        };
    }
    if (distribution.state === 'upstream') {
        return {
            url: distribution.archive.url,
            ...(distribution.archive.bytes === undefined ? {} : { bytes: distribution.archive.bytes }),
            mirrored: false,
        };
    }
    return undefined;
}
