import { escapeHtml } from './dom';

const KANJIVG_RAW_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';

export interface KanjiVGInfo {
    kanji: string;
    svg: string;
    strokeCount: number;
}

export class KanjiVGClient {
    private cache = new Map<string, Promise<KanjiVGInfo | null>>();

    lookup(kanji: string): Promise<KanjiVGInfo | null> {
        const character = Array.from(kanji)[0] ?? '';
        if (!character) return Promise.resolve(null);
        let promise = this.cache.get(character);
        if (!promise) {
            promise = this.fetchSvg(character);
            this.cache.set(character, promise);
        }
        return promise;
    }

    private async fetchSvg(kanji: string): Promise<KanjiVGInfo | null> {
        const url = kanjiVGUrl(kanji);
        const svgText = await requestText(url).catch(() => '');
        if (!svgText) return null;
        return parseKanjiVGSvg(svgText, kanji);
    }
}

export function kanjiVGUrl(kanji: string): string {
    const codePoint = kanji.codePointAt(0) ?? 0;
    return `${KANJIVG_RAW_BASE}/${codePoint.toString(16).padStart(5, '0')}.svg`;
}

export function parseKanjiVGSvg(svgText: string, kanji: string): KanjiVGInfo | null {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const sourceSvg = doc.querySelector('svg');
    if (!sourceSvg) return null;

    const viewBox = sourceSvg.getAttribute('viewBox') || '0 0 109 109';
    const paths = Array.from(sourceSvg.querySelectorAll('path'))
        .map((path, index) => {
            const d = path.getAttribute('d');
            if (!d || !/^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s]+$/.test(d)) return '';
            return `<path d="${escapeHtml(d)}" style="--stroke-index:${index}" />`;
        })
        .filter(Boolean);
    if (!paths.length) return null;

    const numbers = Array.from(sourceSvg.querySelectorAll('text'))
        .map(text => {
            const transform = text.getAttribute('transform') ?? '';
            const label = (text.textContent ?? '').trim();
            if (!/^[\d]+$/.test(label) || !/^matrix\([0-9,.\-\s]+\)$/.test(transform)) return '';
            return `<text transform="${escapeHtml(transform)}">${escapeHtml(label)}</text>`;
        })
        .filter(Boolean);

    const svg = `<svg class="jpdb-reader-kanjivg-svg" viewBox="${escapeHtml(viewBox)}" role="img" aria-label="Stroke order for ${escapeHtml(kanji)}">
        <g class="jpdb-reader-kanjivg-strokes">${paths.join('')}</g>
        <g class="jpdb-reader-kanjivg-numbers">${numbers.join('')}</g>
    </svg>`;

    return { kanji, svg, strokeCount: paths.length };
}

function requestText(url: string): Promise<string> {
    if (typeof GM_xmlhttpRequest === 'function') {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                timeout: 8000,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? ''));
                    else reject(new Error(`Stroke-order request failed (${response.status}).`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Stroke-order request timed out.')),
            });
        });
    }

    return fetch(url).then(response => {
        if (!response.ok) throw new Error(`Stroke-order request failed (${response.status}).`);
        return response.text();
    });
}
