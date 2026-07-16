import { parseKanjiVGSvg } from '../../reader/kanji/vg';
import type { KanjiWritingModel, KanjiWritingService } from './yomu-bridge';

const OFFLINE_TRACES: Readonly<Record<string, string>> = {
    '一': '/academy/vendor/kanjivg/04e00.svg',
    '帰': '/academy/vendor/kanjivg/05e30.svg',
    '理': '/academy/vendor/kanjivg/07406.svg',
};

export interface CanonicalKanjiWritingOptions {
    readonly fetcher?: typeof fetch;
}

/** Loads the small, pinned KanjiVG subset explicitly shipped for a lesson. */
export function createCanonicalKanjiWritingService(
    options: CanonicalKanjiWritingOptions = {},
): KanjiWritingService {
    const fetcher = options.fetcher ?? fetch;
    const cache = new Map<string, Promise<KanjiWritingModel | null>>();
    return {
        lookup(character) {
            const normalized = Array.from(character.trim())[0] ?? '';
            if (!normalized || !OFFLINE_TRACES[normalized]) return Promise.resolve(null);
            let pending = cache.get(normalized);
            if (!pending) {
                pending = fetcher(OFFLINE_TRACES[normalized])
                    .then(response => response.ok ? response.text() : '')
                    .then(svg => svg ? parseKanjiVGSvg(svg, normalized) : null)
                    .then(info => info ? {
                        character: info.kanji,
                        svg: info.svg,
                        strokeCount: info.strokeCount,
                        strokeShapes: info.strokeShapes ?? [],
                        source: {
                            name: 'KanjiVG',
                            url: 'https://kanjivg.tagaini.net/',
                            licence: 'CC BY-SA 3.0',
                            revision: 'eab57831f1e418016a029266c4b17bf824b9af68',
                        },
                    } satisfies KanjiWritingModel : null)
                    .catch(() => null);
                cache.set(normalized, pending);
            }
            return pending;
        },
    };
}
