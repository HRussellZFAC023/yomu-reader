import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
    documentPortalReaderWordScopeForSource,
    projectAdditiveTextMirrors,
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
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            ocr: { pinLineForElement: () => void; destroy: () => void };
            prepareModalLookupFromPointer: () => void;
            showWord: typeof showWord;
            bindEvents(): void;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.ocr = { pinLineForElement: vi.fn(), destroy: vi.fn() };
        internals.prepareModalLookupFromPointer = vi.fn();
        internals.showWord = showWord;
        internals.bindEvents();

        try {
            label.dispatchEvent(pointerEvent('pointerdown', 17, 35, 10));
            const up = pointerEvent('pointerup', 17, 35, 10);
            label.dispatchEvent(up);

            expect(up.defaultPrevented).toBe(true);
            expect(showWord).toHaveBeenCalledTimes(1);
            expect(showWord).toHaveBeenCalledWith(
                expect.objectContaining({ dataset: expect.objectContaining({ expression: '評価' }) }),
                expect.objectContaining({ trigger: 'click', userGesture: true }),
            );
        } finally {
            app.destroy();
            if (restoreGetClientRects) Object.defineProperty(Range.prototype, 'getClientRects', restoreGetClientRects);
            else Reflect.deleteProperty(Range.prototype, 'getClientRects');
        }
    });

    it('maps shelf portal click and hover geometry back to the native role button', () => {
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
        const target = collectFragmentTextTargetsIn(label, 20, false)
            .find(candidate => candidate.text.includes('他'))!;
        const otherStart = target.text.indexOf('他');
        applyTokensToScanTarget(target, [token('他', otherStart, otherStart + 1)], {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'off',
        });

        const restoreGetClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
        Object.defineProperty(Range.prototype, 'getClientRects', {
            configurable: true,
            value() {
                return [{ left: 20, right: 40, top: 30, bottom: 50, width: 20, height: 20 }];
            },
        });
        projectAdditiveTextMirrors(document);
        const portalWord = document.body.querySelector<HTMLElement>(
            '.jpdb-reader-youtube-chrome-portal .jpdb-reader-word[data-expression="他"]',
        )!;
        expect(portalWord).toBeTruthy();

        const app = new ReaderApp();
        const showWord = vi.fn().mockResolvedValue(undefined);
        const internals = app as unknown as {
            settings: typeof DEFAULT_SETTINGS;
            ocr: { pinLineForElement: () => void; destroy: () => void };
            prepareModalLookupFromPointer: () => void;
            showWord: typeof showWord;
            bindEvents(): void;
            readerWordForPointerEvent(event: MouseEvent, options: { clickLookup?: boolean }): HTMLElement | null;
        };
        internals.settings = { ...DEFAULT_SETTINGS, lookupOnClick: true };
        internals.ocr = { pinLineForElement: vi.fn(), destroy: vi.fn() };
        internals.prepareModalLookupFromPointer = vi.fn();
        internals.showWord = showWord;
        internals.bindEvents();
        const nativeClick = vi.fn();
        label.addEventListener('click', nativeClick);

        try {
            let hoverResolved: HTMLElement | null = null;
            label.addEventListener('pointermove', event => {
                hoverResolved = internals.readerWordForPointerEvent(event as PointerEvent, { clickLookup: true });
            }, { once: true });
            label.dispatchEvent(pointerEvent('pointermove', 41, 30, 40));
            expect(hoverResolved).toBe(portalWord);

            const native = mouseEvent('click', 30, 40);
            label.dispatchEvent(native);
            expect(native.defaultPrevented).toBe(false);
            expect(nativeClick).toHaveBeenCalledTimes(1);
            expect(showWord).not.toHaveBeenCalled();

            const forced = mouseEvent('click', 30, 40, { shiftKey: true });
            label.dispatchEvent(forced);
            expect(forced.defaultPrevented).toBe(true);
            expect(showWord).toHaveBeenCalledWith(portalWord, expect.objectContaining({
                trigger: 'click',
                userGesture: true,
            }));
        } finally {
            app.destroy();
            if (restoreGetClientRects) Object.defineProperty(Range.prototype, 'getClientRects', restoreGetClientRects);
            else Reflect.deleteProperty(Range.prototype, 'getClientRects');
        }
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

function mouseEvent(type: string, clientX: number, clientY: number, init: MouseEventInit = {}): MouseEvent {
    return new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        clientX,
        clientY,
        ...init,
    });
}
