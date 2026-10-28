import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, collectTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { MIRROR_TEXT as TEXT, mirrorToken as token, paintMirrorToken } from './helpers/japanese-token-fixtures';

const CARD = token().card;

function paint(host: HTMLElement): void {
    paintMirrorToken(host, { nonDestructive: true });
}

function mirrorsIn(host: HTMLElement): NodeListOf<HTMLElement> {
    return host.querySelectorAll<HTMLElement>('.jpdb-reader-text-mirror');
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

describe('Discord progressive growth - mirror stacking', () => {
    // Discord's React reconciliation relocates the mirror below the host (into
    // a wrapper element) while leaving the host's own text node in place. If the
    // idempotency check only inspects host.children it misses the relocated
    // mirror and appends a second one; over many re-renders mirrors stack and
    // each renders furigana, growing the row unbounded ("spaces get bigger").
    it('reuses a mirror that React reconciliation nested below the host (no stacking)', () => {
        document.body.innerHTML = `<div id="content">${TEXT}</div>`;
        const content = document.getElementById('content')!;

        paint(content);
        expect(mirrorsIn(content).length).toBe(1);

        // A stable wrapper the framework relocates the mirror into on each pass.
        const wrapper = document.createElement('span');
        content.append(wrapper);

        for (let i = 0; i < 15; i++) {
            // React reconciliation: relocate the mirror into the wrapper so it is
            // no longer a DIRECT child of the host, but keep the host's own text
            // node in place. A direct-child-only idempotency check misses it.
            const mirror = content.querySelector('.jpdb-reader-text-mirror');
            if (mirror) wrapper.append(mirror);

            paint(content);

            expect(mirrorsIn(content).length).toBe(1);
        }
    });

    it('removes a relocated (nested) mirror on cleanup instead of orphaning it', () => {
        document.body.innerHTML = `<div id="content">${TEXT}</div>`;
        const content = document.getElementById('content')!;

        paint(content);
        expect(mirrorsIn(content).length).toBe(1);

        // React relocates the mirror below the host, then a repaint recreates it.
        const mirror = content.querySelector('.jpdb-reader-text-mirror')!;
        const wrapper = document.createElement('span');
        content.append(wrapper);
        wrapper.append(mirror);

        // A repaint must not leave the old (relocated) mirror behind.
        paint(content);
        expect(mirrorsIn(content).length).toBe(1);

        removeNonDestructiveScanMirrors(content);
        expect(mirrorsIn(content).length).toBe(0);
    });

    // Safety: a mirror belonging to a NESTED scan host must NOT be reused or
    // torn down as if it were the outer host's mirror.
    it('does not steal a nested host mirror for the outer host', () => {
        document.body.innerHTML = `
            <div id="outer">外側 <span id="inner">日本語</span></div>
        `;
        const inner = document.getElementById('inner')!;
        const outer = document.getElementById('outer')!;

        // Paint the inner host first — it owns its own mirror.
        paint(inner);
        const innerMirror = mirrorsIn(inner)[0];
        expect(innerMirror).toBeTruthy();

        // The outer host has its own Japanese text ("外側"); painting it must
        // create its OWN mirror as a direct child, not reuse the inner one.
        const outerTarget = collectTextTargetsIn(outer, 40, false).find(t => t.text.includes('外側'));
        if (outerTarget) {
            applyTokensToScanTarget(
                { ...outerTarget, nonDestructive: true },
                [{
                    card: { ...CARD, spelling: '外側', reading: 'そとがわ' },
                    start: 0, end: 2, length: 2,
                    rubies: [{ text: 'そとがわ', start: 0, end: 2, length: 2 }],
                    pitchClass: '', sentence: '外側',
                }],
                { ...DEFAULT_SETTINGS, furiganaMode: 'all' },
            );
        }

        // The inner mirror must still belong to inner.
        expect(inner.contains(innerMirror)).toBe(true);
        // Direct children of outer must include an outer-owned mirror distinct
        // from the inner one.
        const outerOwn = Array.from(outer.children).find(c => c.classList?.contains('jpdb-reader-text-mirror'));
        expect(outerOwn).toBeTruthy();
        expect(outerOwn).not.toBe(innerMirror);
    });
});
