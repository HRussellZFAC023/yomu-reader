import { escapeHtml } from '../dom';

/** How many senses a definition shows before the rest wait behind "More meanings". */
export const VISIBLE_SENSE_COUNT = 3;

/** How many example sentences show before the rest wait behind "More examples". */
const VISIBLE_EXAMPLE_COUNT = 1;
type MoreDisclosureKind = 'meanings' | 'examples';

/**
 * The first `visible` rendered items stay in place and the rest wait behind
 * one collapsed disclosure, so a long entry opens on its useful first lines
 * instead of a scrolling page. A single leftover item is shown rather than
 * hidden: a disclosure that reveals one line costs more than the line.
 */
export function renderWithMoreDisclosure(items: readonly string[], visible: number, label: string): string {
    if (items.length <= visible + 1) return items.join('');
    return `${items.slice(0, visible).join('')}${renderMoreDisclosure(items.slice(visible).join(''), label)}`;
}

/** One collapsed "More …" disclosure around already-rendered HTML. */
export function renderMoreDisclosure(innerHtml: string, label: string, kind: MoreDisclosureKind = 'meanings'): string {
    return `<details class="jpdb-reader-more" data-more-kind="${kind}"><summary class="jpdb-reader-more-summary">${escapeHtml(label)}</summary>${innerHtml}</details>`;
}

/** An example list: its first sentence shows and the rest wait behind "More examples". */
export function renderExampleListWithMore(items: readonly string[], label: string): string {
    const list = (html: string): string => `<ul class="jpdb-reader-jpdb-examples">${html}</ul>`;
    if (items.length <= VISIBLE_EXAMPLE_COUNT + 1) return list(items.join(''));
    return `${list(items.slice(0, VISIBLE_EXAMPLE_COUNT).join(''))}${renderMoreDisclosure(list(items.slice(VISIBLE_EXAMPLE_COUNT).join('')), label, 'examples')}`;
}

/** Preserve this popup's disclosures for one render, without creating a saved preference. */
export function preserveMoreDisclosures(root: ParentNode): () => void {
    const states = new Map<string, boolean>();
    for (const [key, details] of keyedDisclosures(root)) states.set(key, details.open);
    return () => {
        for (const [key, details] of keyedDisclosures(root)) {
            const open = states.get(key);
            if (open !== undefined) details.open = open;
        }
    };
}

function keyedDisclosures(root: ParentNode): Array<[string, HTMLDetailsElement]> {
    return [...root.querySelectorAll<HTMLDetailsElement>('details.jpdb-reader-more[data-more-kind]')].flatMap<[string, HTMLDetailsElement]>(details => {
        const source = details.parentElement?.closest<HTMLElement>('[data-source-state-key]');
        if (!source || !root.contains(source)) return [];
        // A dictionary can show several lexical entries. Their identity, not
        // their current order or translated labels, separates their meanings.
        const entry = details.closest<HTMLElement>('[data-more-entry-key]')?.dataset.moreEntryKey ?? '';
        return [[JSON.stringify([source.dataset.sourceStateKey, entry, details.dataset.moreKind]), details]];
    });
}
