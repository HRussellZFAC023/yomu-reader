import { afterEach, describe, expect, it, vi } from 'vitest';

import { boundedCompactText, compactTextLengthAtMost } from '../../src/reader/dom/compact-text';
import { isCompactPassiveInteractionElement } from '../../src/reader/dom/decoration-policy';
import { notePaintedInsertion, withPaintedInsertions } from '../../src/reader/dom/painted-insertions';
import { memoRead, withReadMemo } from '../../src/reader/dom/read-memo';
import { rectMeetsViewport, textNodeOutsideViewport } from '../../src/reader/dom/text-node-viewport';
import { collectFragmentTextTargetsIn } from '../../src/reader/dom';
import { queryScopedDescendants, scopedDescendantSelectorText } from '../../src/reader/app/scoped-descendant-query';

// Pure predicates behind long-page annotation (W1-41). Behaviour on a real
// long page is proven by scripts/long-page-annotation-perf-smoke.mjs.

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

function ancestorWithTextNodes(count: number): HTMLElement {
    const element = document.createElement('div');
    element.setAttribute('tabindex', '0');
    for (let index = 0; index < count; index += 1) element.append(document.createTextNode('字'));
    document.body.append(element);
    return element;
}

function countCharactersRead(): { read: () => number } {
    let read = 0;
    const descriptor = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data')!;
    vi.spyOn(CharacterData.prototype, 'data', 'get').mockImplementation(function (this: CharacterData) {
        const value = descriptor.get!.call(this) as string;
        read += value.length;
        return value;
    });
    return { read: () => read };
}

describe('bounded compact text', () => {
    it('equals the whitespace-free text when it is short', () => {
        const element = document.createElement('p');
        element.innerHTML = ' 日本 <b>語 の</b>\n本 ';
        expect(boundedCompactText(element, 10)).toBe('日本語の本');
        expect(compactTextLengthAtMost(element, 10)).toBe(5);
    });

    it('stops one character past the limit', () => {
        const element = ancestorWithTextNodes(50);
        expect(boundedCompactText(element, 8)).toBe('字'.repeat(9));
        expect(compactTextLengthAtMost(element, 8)).toBe(9);
    });

    it('reads at most limit + 1 characters of an ancestor holding 2,000 text nodes', () => {
        const element = ancestorWithTextNodes(2_000);
        const textContent = vi.spyOn(Node.prototype, 'textContent', 'get');
        const characters = countCharactersRead();

        expect(isCompactPassiveInteractionElement(element)).toBe(false);

        expect(characters.read()).toBeLessThanOrEqual(121);
        expect(textContent).not.toHaveBeenCalled();
    });

    it('answers from the child count alone for an ancestor with many child elements', () => {
        const element = document.createElement('div');
        element.innerHTML = '<span>一</span><span>二</span><span>三</span><span>四</span><span>五</span>';
        const characters = countCharactersRead();
        expect(isCompactPassiveInteractionElement(element)).toBe(false);
        expect(characters.read()).toBe(0);
    });
});

describe('read memo', () => {
    it('reads each fact once per element inside a phase and live outside one', () => {
        const element = document.createElement('div');
        const read = vi.fn(() => ({}));
        const inside = withReadMemo(() => [memoRead('fact', element, read), memoRead('fact', element, read)]);
        expect(read).toHaveBeenCalledTimes(1);
        expect(inside[0]).toBe(inside[1]);
        memoRead('fact', element, read);
        memoRead('fact', element, read);
        expect(read).toHaveBeenCalledTimes(3);
    });

    it('shares the outer phase with a nested one and keeps facts apart by name', () => {
        const element = document.createElement('div');
        const read = vi.fn(() => 1);
        withReadMemo(() => {
            memoRead('a', element, read);
            withReadMemo(() => memoRead('a', element, read));
            memoRead('b', element, read);
        });
        expect(read).toHaveBeenCalledTimes(2);
    });
});

describe('text in view inside an oversized parent', () => {
    const rect = (top: number, height: number, width = 600): DOMRect => ({
        x: 0, y: top, top, left: 0, right: width, bottom: top + height, width, height, toJSON: () => ({}),
    } as DOMRect);

    function novel(lines: number): HTMLElement {
        const root = document.createElement('div');
        root.className = 'main_text';
        root.innerHTML = Array.from({ length: lines }, (_, index) => `日本語の文です${index}`).join('<br>');
        document.body.append(root);
        const textRects = new Map([...root.childNodes].filter(node => node.nodeType === Node.TEXT_NODE)
            .map((node, index) => [node, rect(index * 40, 30)]));
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            return this === root ? rect(0, lines * 40) : rect(0, 30);
        });
        // jsdom has no layout: a Range's box is its text node's line.
        Range.prototype.getBoundingClientRect ??= () => rect(0, 0, 0);
        vi.spyOn(Range.prototype, 'getBoundingClientRect').mockImplementation(function (this: Range) {
            return textRects.get(this.startContainer.childNodes[0] ?? this.startContainer) ?? rect(0, 0, 0);
        });
        return root;
    }

    it('meets the viewport as isVisible judges an element box', () => {
        expect(rectMeetsViewport({ top: -10, bottom: 0, left: 0, right: 10 }, 100, 100)).toBe(true);
        expect(rectMeetsViewport({ top: 101, bottom: 120, left: 0, right: 10 }, 100, 100)).toBe(false);
        expect(rectMeetsViewport({ top: 0, bottom: 10, left: -50, right: -1 }, 100, 100)).toBe(false);
    });

    it('collects only the lines that meet the viewport', () => {
        vi.stubGlobal('innerHeight', 400);
        vi.stubGlobal('innerWidth', 800);
        const root = novel(100);
        const lines = [...root.childNodes].filter((node): node is Text => node.nodeType === Node.TEXT_NODE);

        expect(textNodeOutsideViewport(lines[0]!, root)).toBe(false);
        expect(textNodeOutsideViewport(lines[50]!, root)).toBe(true);
        const texts = collectFragmentTextTargetsIn(root, 200, true, '', { minLength: 1 }).map(target => target.text);
        expect(texts).toEqual(lines.slice(0, 11).map(line => line.data));
        vi.unstubAllGlobals();
    });

    it('leaves a parent no larger than twice the viewport whole', () => {
        vi.stubGlobal('innerHeight', 400);
        vi.stubGlobal('innerWidth', 800);
        const root = novel(15);
        const lines = [...root.childNodes].filter((node): node is Text => node.nodeType === Node.TEXT_NODE);
        expect(textNodeOutsideViewport(lines[14]!, root)).toBe(false);
        vi.unstubAllGlobals();
    });
});

describe('painted insertions', () => {
    it('reports the elements a paint inserted, fragment children included', () => {
        const word = document.createElement('span');
        const fragment = document.createDocumentFragment();
        const first = document.createElement('span');
        fragment.append(first, document.createTextNode('の'));
        const inserted = withPaintedInsertions(() => {
            notePaintedInsertion(fragment);
            notePaintedInsertion(word);
            notePaintedInsertion(document.createTextNode('plain'));
        });
        expect(inserted).toEqual([first, word]);
        notePaintedInsertion(word);
        expect(withPaintedInsertions(() => undefined)).toEqual([]);
    });
});

describe('scoped descendant query', () => {
    it('finds what the combined selector list finds, in document order', () => {
        document.body.innerHTML = `
            <nav id="n"><a id="a1" href="/1">一</a><header><button id="b1">二</button></header></nav>
            <main><a id="a2" href="/2">三</a><button id="b2">四</button></main>
            <header id="h"><a id="a3" href="/3">五</a></header>
            <summary id="s">六</summary>`;
        const query = { scopes: ['nav', 'header'], inner: ['a[href]', 'button'], plain: ['main a[href]', 'summary'] };
        const staged = queryScopedDescendants<HTMLElement>(query).map(element => element.id);
        const combined = [...document.querySelectorAll<HTMLElement>(scopedDescendantSelectorText(query))].map(element => element.id);
        expect(staged).toEqual(combined);
        expect(staged).toEqual(['n', 'a1', '', 'b1', 'a2', 'h', 'a3', 's']);
    });
});
