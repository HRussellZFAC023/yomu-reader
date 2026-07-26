import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    clearProjectedReadings,
    syncProjectedReadings,
} from '../../src/reader/dom/detached-reading-overlay-impl';

function rect(left = 20, top = 20, width = 40, height = 16): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

function projectedReading(text: string): HTMLElement | undefined {
    return [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
        .find(reading => reading.textContent === text);
}

async function nextProjectionFrame(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

// Scene construction is itself a childList mutation that qualifies under the
// existing filter. Drain that batch so each case measures only its own change.
async function settle(): Promise<void> {
    await nextProjectionFrame();
    await nextProjectionFrame();
}

function mockElementsFromPoint(elements: Element[]): void {
    Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: vi.fn(() => elements),
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'elementsFromPoint');
    document.body.innerHTML = '';
});

// A second userscript appends an inline English gloss after each Japanese run,
// turning 圧縮形式 into "圧縮 (compression)形式 (format)". Nothing it inserts
// touches an annotated word, but every word after the insertion point slides
// right, so readings measured before it are left behind.
function glossScene(parentClassName = ''): {
    paragraph: HTMLElement;
    precedingWord: HTMLElement;
    anchor: HTMLElement;
    source: HTMLElement;
    setRect: (next: DOMRect) => void;
} {
    const paragraph = document.createElement('p');
    if (parentClassName) paragraph.className = parentClassName;
    const precedingWord = document.createElement('span');
    precedingWord.className = 'jpdb-reader-word';
    precedingWord.textContent = '圧縮';
    const anchor = document.createElement('span');
    anchor.className = 'jpdb-reader-word';
    const wrapper = document.createElement('span');
    wrapper.className = 'jpdb-reader-detached-ruby';
    const source = document.createElement('span');
    source.className = 'jpdb-reader-detached-furi';
    source.textContent = 'けいしき';
    wrapper.append(source);
    anchor.append(wrapper);
    paragraph.append(precedingWord, anchor);
    document.body.append(paragraph);

    let current = rect(100, 40);
    anchor.getBoundingClientRect = () => current;
    mockElementsFromPoint([anchor, paragraph]);
    syncProjectedReadings(anchor, [{
        source,
        anchor,
        rect: current,
        measure: () => current,
    }]);
    return { paragraph, precedingWord, anchor, source, setRect: next => { current = next; } };
}

describe('projected readings follow a word moved by a mutation that never touches it', () => {
    it('repositions when a gloss is appended INSIDE the preceding annotated word', async () => {
        const scene = glossScene();
        expect(projectedReading('けいしき')?.style.left).toBe('120px');
        await settle();

        scene.setRect(rect(240, 40));
        scene.precedingWord.append(document.createTextNode(' (compression)'));
        await nextProjectionFrame();

        expect(projectedReading('けいしき')?.style.left).toBe('260px');
        clearProjectedReadings(scene.anchor);
    });

    it('repositions when a gloss element is appended inside the preceding annotated word', async () => {
        const scene = glossScene();
        expect(projectedReading('けいしき')?.style.left).toBe('120px');
        await settle();

        scene.setRect(rect(240, 40));
        const gloss = document.createElement('span');
        gloss.textContent = ' (compression)';
        scene.precedingWord.append(gloss);
        await nextProjectionFrame();

        expect(projectedReading('けいしき')?.style.left).toBe('260px');
        clearProjectedReadings(scene.anchor);
    });

    it('repositions when a gloss lands inside a plain sibling subtree of the word', async () => {
        const scene = glossScene();
        const plain = document.createElement('span');
        plain.textContent = '·';
        scene.paragraph.insertBefore(plain, scene.precedingWord);
        expect(projectedReading('けいしき')?.style.left).toBe('120px');
        await settle();

        scene.setRect(rect(240, 40));
        plain.append(document.createTextNode(' (compression)'));
        await nextProjectionFrame();

        expect(projectedReading('けいしき')?.style.left).toBe('260px');
        clearProjectedReadings(scene.anchor);
    });

    it('repositions when the reflowed container carries a reader class of our own', async () => {
        const scene = glossScene('jpdb-reader-annotated-block');
        expect(projectedReading('けいしき')?.style.left).toBe('120px');
        await settle();

        scene.setRect(rect(240, 40));
        scene.paragraph.insertBefore(document.createTextNode(' (compression)'), scene.anchor);
        await nextProjectionFrame();

        expect(projectedReading('けいしき')?.style.left).toBe('260px');
        clearProjectedReadings(scene.anchor);
    });

    // The perf guard the filter exists for: churn in a distant subtree must not
    // schedule any pass at all.
    it('still ignores churn in a distant subtree', async () => {
        const distant = document.createElement('section');
        const distantChild = document.createElement('div');
        distantChild.textContent = 'framework';
        distant.append(distantChild);
        document.body.append(distant);
        const scene = glossScene();
        expect(projectedReading('けいしき')?.style.left).toBe('120px');
        await settle();

        scene.setRect(rect(240, 40));
        distantChild.append(document.createTextNode(' churn'));
        await nextProjectionFrame();

        expect(projectedReading('けいしき')?.style.left).toBe('120px');
        clearProjectedReadings(scene.anchor);
    });

    // Painting a clone writes style + data-* on it, and the observer watches
    // style. If those writes counted as page movement the pass would re-arm
    // itself every frame forever.
    it('does not re-arm a pass from its own clone writes', async () => {
        const scene = glossScene();
        await settle();
        const frames: number[] = [];
        const raf = requestAnimationFrame;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
            frames.push(1);
            return raf(callback);
        });

        scene.setRect(rect(240, 40));
        scene.precedingWord.append(document.createTextNode(' (compression)'));
        await nextProjectionFrame();
        const afterFix = frames.length;
        await nextProjectionFrame();
        await nextProjectionFrame();
        // Frames requested by the helper itself are 2 per nextProjectionFrame;
        // a self-arming loop would add one refresh frame per settle round.
        expect(frames.length - afterFix).toBeLessThanOrEqual(4);
        clearProjectedReadings(scene.anchor);
    });
});
