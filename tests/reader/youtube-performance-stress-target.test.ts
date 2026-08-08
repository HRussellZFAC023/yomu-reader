import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installYoutubePerformanceStressTargetSelector } from '../../scripts/lib/youtube-performance-stress-target.mjs';

interface StressTarget {
    expected: string;
    expression: string;
    lane: string;
    occurrence: number;
    sourceText: string;
    x: number;
    y: number;
    geometry: {
        rect: { left: number; top: number; width: number; height: number };
        sourceHost: string;
        sourceStart: number | null;
        sourceEnd: number | null;
    };
}

interface StressTargetRequest {
    expression: string;
    lane: string;
    occurrence?: number;
    sourceText?: string;
}

type StressTargetWindow = Window & typeof globalThis & {
    __yomuProfileSelectStressTarget?: (selector: string, request: StressTargetRequest) => StressTarget | null;
};

let rangeRectsDescriptor: PropertyDescriptor | undefined;
let elementFromPointDescriptor: PropertyDescriptor | undefined;

describe('YouTube performance stress target selection', () => {
    beforeEach(() => {
        rangeRectsDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
        elementFromPointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
        Object.defineProperty(Range.prototype, 'getClientRects', {
            configurable: true,
            value: () => [new DOMRect(20, 20, 48, 20)],
        });
        installYoutubePerformanceStressTargetSelector();
    });

    afterEach(() => {
        document.body.replaceChildren();
        delete (window as StressTargetWindow).__yomuProfileSelectStressTarget;
        restoreProperty(Range.prototype, 'getClientRects', rangeRectsDescriptor);
        restoreProperty(document, 'elementFromPoint', elementFromPointDescriptor);
    });

    it('targets the exact projected source fragment and verifies its native source range', () => {
        const source = document.createElement('span');
        source.id = 'native-comment';
        source.textContent = '日本語を読む';
        const { word, fragment } = projectedPortalWord('日本語を読む', '日本語', 0, 3);
        document.body.append(source, word.closest('.jpdb-reader-document-annotation-portal')!);
        stubClientRects(fragment, [new DOMRect(20, 20, 48, 20)]);
        stubClientRects(word, [new DOMRect(0, 0, 900, 500)]);
        stubElementFromPoint(() => source);

        const target = selectTarget('.stress-candidate', {
            expression: '日本語',
            lane: 'portal',
            sourceText: '日本語を読む',
        });

        expect(target).toMatchObject({
            expected: '日本語',
            expression: '日本語',
            lane: 'portal',
            occurrence: 0,
            sourceText: '日本語を読む',
            x: 44,
            y: 30,
            geometry: {
                rect: { left: 20, top: 20, width: 48, height: 20 },
                sourceHost: 'span#native-comment',
                sourceStart: 0,
                sourceEnd: 3,
            },
        });
    });

    it('rejects a covered requested target instead of substituting another expression', () => {
        const source = document.createElement('span');
        source.textContent = '日本語を読む';
        const { word: portalWord, fragment } = projectedPortalWord('日本語を読む', '日本語', 0, 3);
        stubClientRects(fragment, [new DOMRect(20, 20, 48, 20)]);

        const ocrWord = document.createElement('span');
        ocrWord.className = 'jpdb-reader-word';
        ocrWord.dataset.expression = 'を';

        const visibleWord = document.createElement('span');
        visibleWord.className = 'jpdb-reader-word stress-candidate';
        visibleWord.dataset.expression = '先生';
        visibleWord.textContent = '先生';
        stubClientRects(visibleWord, [new DOMRect(120, 40, 40, 20)]);

        document.body.append(
            source,
            portalWord.closest('.jpdb-reader-document-annotation-portal')!,
            ocrWord,
            visibleWord,
        );
        stubElementFromPoint((x: number) => x < 100 ? ocrWord : visibleWord);

        const target = selectTarget('.stress-candidate', {
            expression: '日本語',
            lane: 'portal',
            sourceText: '日本語を読む',
        });

        expect(target).toBeNull();
    });

    it('selects the requested expression and lane regardless of DOM priority', () => {
        const first = directWord('先生', new DOMRect(20, 20, 40, 20));
        const second = directWord('今日', new DOMRect(120, 40, 40, 20));
        document.body.append(first, second);
        stubElementFromPoint((x: number) => x < 100 ? first : second);

        const target = selectTarget('.stress-candidate', { expression: '今日', lane: 'word' });

        expect(target).toMatchObject({ expression: '今日', lane: 'word', occurrence: 0, x: 140, y: 50 });
    });

    it('uses an exact occurrence and does not fall through when it is absent', () => {
        const first = directWord('先生', new DOMRect(20, 20, 40, 20));
        const second = directWord('先生', new DOMRect(120, 40, 40, 20));
        document.body.append(first, second);
        stubElementFromPoint((x: number) => x < 100 ? first : second);

        expect(selectTarget('.stress-candidate', { expression: '先生', lane: 'word', occurrence: 1 }))
            .toMatchObject({ expression: '先生', occurrence: 1, x: 140, y: 50 });
        expect(selectTarget('.stress-candidate', { expression: '先生', lane: 'word', occurrence: 2 }))
            .toBeNull();
    });
});

function projectedPortalWord(sourceText: string, expression: string, start: number, end: number): {
    word: HTMLElement;
    fragment: HTMLElement;
} {
    const portal = document.createElement('span');
    portal.className = 'jpdb-reader-text-mirror jpdb-reader-additive-text-mirror jpdb-reader-document-annotation-portal';
    portal.dataset.sourceText = sourceText;
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word stress-candidate';
    word.dataset.expression = expression;
    word.dataset.yomuSourceStart = String(start);
    word.dataset.yomuSourceEnd = String(end);
    const fragment = document.createElement('span');
    fragment.className = 'jpdb-reader-source-fragment';
    word.append(fragment);
    portal.append(word);
    return { word, fragment };
}

function directWord(expression: string, rect: DOMRect): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word stress-candidate';
    word.dataset.expression = expression;
    word.textContent = expression;
    stubClientRects(word, [rect]);
    return word;
}

function selectTarget(selector: string, request: StressTargetRequest): StressTarget | null {
    return (window as StressTargetWindow).__yomuProfileSelectStressTarget?.(selector, request) ?? null;
}

function stubClientRects(element: Element, rects: DOMRect[]): void {
    Object.defineProperty(element, 'getClientRects', {
        configurable: true,
        value: () => rects,
    });
}

function stubElementFromPoint(resolve: (x: number, y: number) => Element): void {
    Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: resolve,
    });
}

function restoreProperty(target: object, key: PropertyKey, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
}
