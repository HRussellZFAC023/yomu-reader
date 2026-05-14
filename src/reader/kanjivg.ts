import { escapeHtml } from './dom';
import { Logger } from './logger';
import { getUserscriptHttpRequest } from './userscript';

const KANJIVG_RAW_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';
const log = Logger.scope('KanjiVG');

export interface KanjiVGInfo {
    kanji: string;
    svg: string;
    strokeCount: number;
    componentPositions?: KanjiVGComponentPosition[];
}

export interface KanjiVGComponentPosition {
    component: string;
    original?: string;
    position: string;
    direct: boolean;
}

export class KanjiVGClient {
    private cache = new Map<string, Promise<KanjiVGInfo | null>>();

    lookup(kanji: string): Promise<KanjiVGInfo | null> {
        const character = Array.from(kanji)[0] ?? '';
        if (!character) return Promise.resolve(null);
        let promise = this.cache.get(character);
        if (!promise) {
            log.debug('Lookup cache miss', { kanji: character });
            promise = this.fetchSvg(character);
            this.cache.set(character, promise);
        } else {
            log.debug('Lookup cache hit', { kanji: character });
        }
        return promise;
    }

    private async fetchSvg(kanji: string): Promise<KanjiVGInfo | null> {
        const url = kanjiVGUrl(kanji);
        const svgText = await requestText(url).catch(error => {
            log.warn('Stroke-order request failed', { kanji }, error);
            return '';
        });
        if (!svgText) return null;
        const info = parseKanjiVGSvg(svgText, kanji);
        log.debug('Stroke-order SVG parsed', { kanji, found: Boolean(info), strokes: info?.strokeCount ?? 0 });
        return info;
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
    const componentPositions = readKanjiVGComponentPositions(sourceSvg, kanji);
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

    return { kanji, svg, strokeCount: paths.length, componentPositions };
}

function readKanjiVGComponentPositions(sourceSvg: SVGSVGElement, kanji: string): KanjiVGComponentPosition[] {
    const root = Array.from(sourceSvg.querySelectorAll('g'))
        .find(group => group.getAttribute('kvg:element') === kanji);
    const positions = new Map<string, KanjiVGComponentPosition>();
    const add = (entry: KanjiVGComponentPosition) => {
        const key = `${entry.component}\u0000${entry.original ?? ''}\u0000${entry.position}`;
        const existing = positions.get(key);
        if (!existing || (!existing.direct && entry.direct)) positions.set(key, entry);
    };

    Array.from(sourceSvg.querySelectorAll('g')).forEach(group => {
        const component = cleanComponent(group.getAttribute('kvg:element') ?? '');
        if (!component || component === kanji) return;
        const position = cleanComponent(group.getAttribute('kvg:position') ?? inheritedKanjiVGPosition(group, root));
        if (!position) return;
        const original = cleanComponent(group.getAttribute('kvg:original') ?? '');
        const direct = Boolean(root && group.parentNode === root);
        add({ component, original: original || undefined, position, direct });
        if (original && original !== component) add({ component: original, original: component, position, direct });
    });

    return Array.from(positions.values());
}

function inheritedKanjiVGPosition(group: Element, root: Element | undefined): string {
    let parent = group.parentElement;
    while (parent && parent !== root) {
        const position = parent.getAttribute('kvg:position');
        if (position) return position;
        parent = parent.parentElement;
    }
    return '';
}

function cleanComponent(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function requestText(url: string): Promise<string> {
    const userscriptRequest = getUserscriptHttpRequest();
    if (userscriptRequest) {
        return new Promise((resolve, reject) => {
            userscriptRequest({
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
