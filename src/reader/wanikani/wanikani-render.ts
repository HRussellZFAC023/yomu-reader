// WaniKani mnemonic/hint text carries a small fixed set of pseudo-tags
// (<radical>, <kanji>, <vocabulary>, <reading>, <meaning>, <ja>) instead of
// HTML. Only those known tags become styled spans; everything else is
// escaped text. The API text is otherwise never inserted as innerHTML.

const KNOWN_TAGS = new Set(['radical', 'kanji', 'vocabulary', 'reading', 'meaning', 'ja']);
const TAG_RE = /<(\/?)(radical|kanji|vocabulary|reading|meaning|ja)>/gu;

export function renderWanikaniMarkup(text: string): string {
    if (!text) return '';
    let result = '';
    let lastIndex = 0;
    const openTags: string[] = [];
    TAG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = TAG_RE.exec(text)) !== null) {
        const [full, closing, tag] = match;
        result += escapeHtml(text.slice(lastIndex, match.index));
        lastIndex = match.index + full.length;
        if (!KNOWN_TAGS.has(tag)) continue;
        if (closing) {
            if (openTags.at(-1) === tag) {
                result += '</span>';
                openTags.pop();
            } else {
                result += escapeHtml(full);
            }
        } else {
            result += `<span class="yomu-wanikani-tag yomu-wanikani-tag-${tag}">`;
            openTags.push(tag);
        }
    }
    result += escapeHtml(text.slice(lastIndex));
    while (openTags.pop()) result += '</span>';
    return result;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;')
        .replace(/'/gu, '&#39;');
}
