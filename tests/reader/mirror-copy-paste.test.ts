import { afterEach, describe, expect, it } from 'vitest';

import { removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { MIRROR_TEXT as TEXT, paintMirrorToken as paint } from './helpers/japanese-token-fixtures';

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// The hidden text mirror is a full duplicate of the host text. If it stays
// selectable, Cmd+A / copy grabs BOTH the visible host text AND the mirror's
// duplicate (doubled/garbled clipboard) and the furigana rt readings come along
// too. The mirror must be excluded from selection AND the a11y tree so the only
// selectable copy is the clean original host text.
describe('text mirror copy/paste isolation', () => {
    it('marks the created mirror aria-hidden so screen readers and copy skip the duplicate', () => {
        document.body.innerHTML = `<span id="title" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('title')!;
        paint(host);
        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.getAttribute('aria-hidden')).toBe('true');
    });


});
