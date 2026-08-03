import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Which dictionary the parity measurement is about, for one study target.
 *
 * This used to be `wty-${language}-en` by naming convention, duplicated in the
 * recorder and again in the ratchet. For Cantonese the convention and the product
 * had diverged completely: it pinned `wty-yue-en` at 28,109 bytes — a Wiktionary
 * extraction with almost nothing in it — so yue recorded 0 words out of 47 while
 * the roster averaged 84.2%, and the number described the pin rather than the
 * language. With the dictionary a learner is actually offered, Words.hk at
 * 13.6 MB, the same corpus measures 25 of 47.
 *
 * Read from the frozen published manifests rather than the runtime shelf: those
 * carry the plain catalogue id, while the runtime namespaces its ids per
 * learner/target pair, and a test already asserts the two agree. Recorder and
 * ratchet share this one function so they cannot drift apart again — that drift is
 * what let the licence check fail while the recording itself was correct.
 */
export function parityDictionaryId(language: string): string {
    const manifestPath = resolve(
        dirname(fileURLToPath(import.meta.url)),
        `../../config/dictionaries/published/v1/recommendations/en-${language}.json`,
    );
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        dictionaries?: { dictionaryId: string; role: string }[];
    };
    const terms = (manifest.dictionaries ?? []).find(entry => entry.role.endsWith('terms'));
    if (!terms) throw new Error(`${language}: the recommendation manifest offers no terms dictionary.`);
    return terms.dictionaryId;
}
