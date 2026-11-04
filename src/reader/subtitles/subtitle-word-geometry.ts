import { nativeTextRects } from '../dom/reading-collision';
import { setStylePropertyIfChanged } from './subtitle-surface';

interface LineBox { left: number; top: number; width: number; height: number }
interface WordGeometry { word: HTMLElement; lines: LineBox[]; box: DOMRect; scaleX: number; scaleY: number; fontSize: number }
const layouts = new WeakMap<HTMLElement, { firstChild: ChildNode | null; signature: string }>();
const fontRevisions = new WeakMap<Document, { value: number }>();
const FRAGMENT = '[data-yomu-subtitle-fragment]';

/** Caption words are atomic in the cue, but an oversized token can wrap inside
 * its own box. Reuse the source-fragment underline lane for those internal lines. */
export function refreshSubtitleWordUnderlines(root: HTMLElement): void {
    const primary = root.querySelector<HTMLElement>('.jpdb-subtitle-primary');
    if (!primary) return;
    const style = getComputedStyle(primary);
    const signature = [fontRevision(primary.ownerDocument), primary.clientWidth, primary.clientHeight,
        style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle, style.fontStretch, style.fontVariant,
        style.fontFeatureSettings, style.fontVariationSettings, style.fontKerning, style.fontOpticalSizing,
        style.lineHeight, style.letterSpacing, style.wordSpacing].join('|');
    const previous = layouts.get(primary);
    if (previous?.firstChild === primary.firstChild && previous.signature === signature) return;
    layouts.set(primary, { firstChild: primary.firstChild, signature });
    // Finish all geometry reads before the fragment writes.
    const plans = Array.from(primary.querySelectorAll<HTMLElement>('.jpdb-reader-word'), measureWord);
    plans.forEach(syncFragments);
}

function fontRevision(document: Document): number {
    let revision = fontRevisions.get(document);
    if (revision) return revision.value;
    revision = { value: 0 };
    const state = revision;
    fontRevisions.set(document, state);
    document.fonts?.addEventListener('loadingdone', () => {
        state.value += 1;
        document.querySelectorAll<HTMLElement>('.jpdb-subtitle-player').forEach(refreshSubtitleWordUnderlines);
    });
    return state.value;
}

function measureWord(word: HTMLElement): WordGeometry {
    const style = getComputedStyle(word);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const box = word.getBoundingClientRect();
    const width = Number.parseFloat(style.width);
    const height = Number.parseFloat(style.height);
    const scaleX = width > 0 ? box.width / width : 1;
    const scaleY = height > 0 ? box.height / height : 1;
    const wrapped = word.offsetHeight > Math.ceil(lineHeight);
    return { word, box, scaleX, scaleY, fontSize: Number.parseFloat(style.fontSize),
        lines: wrapped ? mergeLineBoxes(nativeTextRects(word)) : [] };
}

function mergeLineBoxes(rects: DOMRect[]): LineBox[] {
    const lines: LineBox[] = [];
    for (const rect of rects) {
        const previous = lines.at(-1);
        if (!previous || Math.abs(previous.top - rect.top) >= rect.height / 2) {
            lines.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
            continue;
        }
        const right = Math.max(previous.left + previous.width, rect.right);
        previous.left = Math.min(previous.left, rect.left);
        previous.width = right - previous.left;
    }
    return lines.length > 1 ? lines : [];
}

function syncFragments({ word, lines, box, scaleX, scaleY, fontSize }: WordGeometry): void {
    const existing = Array.from(word.querySelectorAll<HTMLElement>(`:scope > ${FRAGMENT}`));
    word.toggleAttribute('data-yomu-subtitle-wrapped', lines.length > 0);
    const totalWidth = lines.reduce((sum, line) => sum + line.width / scaleX, 0);
    let offset = 0;
    lines.forEach((line, index) => {
        const fragment = existing[index] ?? word.ownerDocument.createElement('span');
        fragment.className = 'jpdb-reader-source-fragment';
        fragment.setAttribute('data-yomu-subtitle-fragment', '');
        fragment.setAttribute('aria-hidden', 'true');
        const width = line.width / scaleX;
        const geometry = {
            left: `${(line.left - box.left) / scaleX}px`,
            // Range bounds include the font's ascent/descent. Centre its em
            // square in those bounds, exactly as the single-line lane does.
            top: `${(line.top - box.top) / scaleY + (line.height / scaleY + fontSize) / 2}px`,
            width: `${width}px`,
            '--jpdb-reader-source-gradient-width': `${totalWidth}px`,
            '--jpdb-reader-source-gradient-offset': `${-offset}px`,
        };
        Object.entries(geometry).forEach(([property, value]) => setStylePropertyIfChanged(fragment, property, value));
        if (!existing[index]) word.append(fragment);
        offset += width;
    });
    existing.slice(lines.length).forEach(fragment => fragment.remove());
}
