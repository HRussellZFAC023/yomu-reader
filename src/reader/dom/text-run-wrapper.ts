import { sliceDisplayOf } from './slice-style-facts';

// A raw text child of a flex/grid host is ONE anonymous item. Keep its tokens
// together on every render path, including passive/suppressed chrome. The
// display comes from the apply slice's read phase, before any DOM writes.
export function wrapDirectFlexGridTextRun(replacement: DocumentFragment, parent: HTMLElement | null): DocumentFragment {
    const display = parent ? sliceDisplayOf(parent) : '';
    if (!display.includes('flex') && !display.includes('grid')) return replacement;
    const fragment = document.createDocumentFragment();
    const run = document.createElement('span');
    run.className = 'jpdb-reader-run';
    run.append(replacement);
    fragment.append(run);
    return fragment;
}
