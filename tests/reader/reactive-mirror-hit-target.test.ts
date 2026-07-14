import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';
import {
    applyTokensToScanTarget,
    collectFragmentTextTargetsIn,
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
