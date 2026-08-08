import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    documentPortalReaderWordScopeForSource,
    removeNonDestructiveScanMirrors,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const CARD: JPDBCard = {
    vid: 1,
    sid: 1,
    rid: 0,
    spelling: '',
    reading: '',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'jpdb',
};

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('reactive mirror source hit targets', () => {
    it('opens the source word under the tap outside legacy prose/control scopes', () => {
        document.body.innerHTML = '<section><span id="label">高評価</span></section>';
        const label = document.getElementById('label')!;
        markReactOwned(label);
        const target = collectFragmentTextTargetsIn(label, 20, false).find(candidate => candidate.text === '高評価');
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [
            token('高', 0, 1),
            token('評価', 1, 3),
        ], { ...DEFAULT_SETTINGS, furiganaMode: 'off' });

        const restoreGetClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
        Object.defineProperty(Range.prototype, 'getClientRects', {
            configurable: true,
            value(this: Range) {
                const left = this.startOffset === 0 ? 0 : 20;
                const right = this.startOffset === 0 ? 20 : 60;
                return [{ left, right, top: 0, bottom: 20, width: right - left, height: 20 }];
            },
        });

        const app = new ReaderApp();
        const showLookupCandidate = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            ocr: { pinLineForElement: () => void; destroy: () => void };
            prepareModalLookupFromPointer: () => void;
            showLookupCandidate: typeof showLookupCandidate;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.ocr = { pinLineForElement: vi.fn(), destroy: vi.fn() };
        internals.prepareModalLookupFromPointer = vi.fn();
        internals.showLookupCandidate = showLookupCandidate;
        internals.bindEvents();

        try {
            label.dispatchEvent(pointerEvent('pointerdown', 17, 35, 10));
            const up = pointerEvent('pointerup', 17, 35, 10);
            label.dispatchEvent(up);

            expect(up.defaultPrevented).toBe(true);
            expect(showLookupCandidate).toHaveBeenCalledTimes(1);
            // The tap resolves the mirror word under the pointer into a
            // sentence-space candidate; the span authority picks the span from
            // there, so the seam to assert is the candidate, not showWord.
            expect(showLookupCandidate).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: '高評価',
                    offset: 2,
                    anchor: expect.objectContaining({ dataset: expect.objectContaining({ expression: '評価' }) }),
                }),
                'modal',
                expect.objectContaining({ userGesture: true }),
            );
        } finally {
            app.destroy();
            if (restoreGetClientRects) Object.defineProperty(Range.prototype, 'getClientRects', restoreGetClientRects);
            else Reflect.deleteProperty(Range.prototype, 'getClientRects');
        }
    });

    it('leaves the YouTube shelf expander native and unannotated', () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/results?search_query=camera',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
        });
        document.body.innerHTML = `
            <ytd-shelf-renderer>
                <ytd-vertical-list-renderer>
                    <div id="more">
                        <yt-formatted-string id="label" role="button" tabindex="0"><span>+ </span><span>他 3 件</span></yt-formatted-string>
                    </div>
                </ytd-vertical-list-renderer>
            </ytd-shelf-renderer>
        `;
        const label = document.getElementById('label')!;
        markReactOwned(label);
        const original = label.innerHTML;
        const targets = collectFragmentTextTargetsIn(label, 20, false);
        const nativeClick = vi.fn();
        label.addEventListener('click', nativeClick);

        label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(targets).toEqual([]);
        expect(label.innerHTML).toBe(original);
        expect(label.querySelector('.jpdb-reader-text-mirror, .jpdb-reader-word')).toBeNull();
        expect(document.querySelector('.jpdb-reader-youtube-chrome-portal')).toBeNull();
        expect(nativeClick).toHaveBeenCalledTimes(1);
    });

    it('lets a nearer in-host control mirror win over an outer prose portal', () => {
        document.body.innerHTML = `
            <article id="thread" class="comment-thread">
                外側文章
                <button id="inner-control">内側</button>
            </article>
        `;
        const thread = document.getElementById('thread')!;
        const innerControl = document.getElementById('inner-control')!;
        markReactOwned(thread);
        markReactOwned(innerControl);

        const outerTarget = collectFragmentTextTargetsIn(thread, 20, false)
            .find(candidate => candidate.text.trim() === '外側文章');
        expect(outerTarget).toBeTruthy();
        applyTokensToScanTarget({ ...outerTarget!, nonDestructive: true }, [token('外側文章', 0, 4)], {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'off',
        });

        const innerTarget = collectFragmentTextTargetsIn(innerControl, 20, false)
            .find(candidate => candidate.text === '内側');
        expect(innerTarget).toBeTruthy();
        applyTokensToScanTarget({
            ...innerTarget!,
            decoration: 'interactive-passive',
            passiveInteraction: true,
            suppressRuby: true,
            nonDestructive: true,
        }, [token('内側', 0, 2)], {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'off',
        });

        expect(documentPortalReaderWordScopeForSource(thread)).not.toBeNull();
        // Hit testing must stop at the nearer in-host scope instead of leaking
        // outward to the article portal that also contains this source node.
        expect(documentPortalReaderWordScopeForSource(innerControl)).toBeNull();
        expect(innerControl.querySelector('.jpdb-reader-text-mirror .jpdb-reader-word')).not.toBeNull();
    });
});

function token(surface: string, start: number, end: number): JPDBToken {
    return {
        card: { ...CARD, spelling: surface, reading: surface },
        start,
        end,
        length: end - start,
        rubies: [],
        pitchClass: 'heiban',
        sentence: '高評価',
    };
}

function markReactOwned(element: Element): void {
    (element as unknown as Record<string, unknown>).__reactFiber$sourceHit = {};
    (element as unknown as Record<string, unknown>).__reactProps$sourceHit = {};
}

function pointerEvent(type: string, pointerId: number, clientX: number, clientY: number): PointerEvent {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        clientX,
        clientY,
    });
    Object.defineProperties(event, {
        pointerId: { configurable: true, value: pointerId },
        pointerType: { configurable: true, value: 'touch' },
        isPrimary: { configurable: true, value: true },
    });
    return event as unknown as PointerEvent;
}
