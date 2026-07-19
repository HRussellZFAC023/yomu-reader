import { afterEach, describe, expect, it } from 'vitest';

import {
    ANNOTATION_SCOPE_ATTRIBUTE,
    annotationScopeActive,
    annotationScopeRoots,
    mutationMayExpandAnnotationScope,
    nodeWithinAnnotationScope,
    queryWithinAnnotationScope,
    scanScopeRoots,
} from '../../src/reader/app/annotation-scope';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { detectReaderStartupJapaneseText } from '../../src/reader/app/startup';

afterEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(ANNOTATION_SCOPE_ATTRIBUTE);
});

function activateScope(): void {
    document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'surface');
}

function mockVisibleElementRects(): () => void {
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        width: 240,
        height: 36,
        top: 0,
        right: 240,
        bottom: 36,
        left: 0,
        toJSON: () => ({}),
    } as DOMRect);
    return () => { HTMLElement.prototype.getBoundingClientRect = originalRect; };
}

describe('annotation scope primitives', () => {
    it('activates only for the surface value', () => {
        expect(annotationScopeActive()).toBe(false);
        expect(annotationScopeRoots()).toBeNull();
        activateScope();
        expect(annotationScopeActive()).toBe(true);
        document.documentElement.setAttribute(ANNOTATION_SCOPE_ATTRIBUTE, 'other');
        expect(annotationScopeActive()).toBe(false);
    });

    it('uses the body when inactive and declared surfaces when active', () => {
        document.body.innerHTML = '<div data-yomu-runtime-surface id="a"></div><div class="yomu-try-me-text" id="b"></div>';
        expect(scanScopeRoots()).toEqual([document.body]);
        activateScope();
        expect((scanScopeRoots() as HTMLElement[]).map(root => root.id).sort()).toEqual(['a', 'b']);
    });

    it('collapses nested surfaces into the outermost ancestor', () => {
        activateScope();
        document.body.innerHTML = '<div data-yomu-runtime-surface id="outer"><div class="yomu-try-me-text" id="inner"></div></div>';
        expect(annotationScopeRoots()?.map(root => root.id)).toEqual(['outer']);
    });

    it('queries the document when inactive and only surface roots and descendants when active', () => {
        document.body.innerHTML = `
            <main id="chrome"><p>chrome</p></main>
            <div data-yomu-runtime-surface><main id="inside"><p>surface</p></main></div>
            <article class="yomu-try-me-text" id="self"></article>
        `;
        expect(queryWithinAnnotationScope<HTMLElement>('main, article').map(element => element.id)).toContain('chrome');
        activateScope();
        expect(queryWithinAnnotationScope<HTMLElement>('main, article').map(element => element.id).sort()).toEqual(['inside', 'self']);
    });

    it('recognises nodes and open shadow roots only inside declared surfaces', () => {
        document.body.innerHTML = `
            <div id="chrome"></div>
            <section data-yomu-runtime-surface><div id="inside"></div></section>
        `;
        const chrome = document.querySelector<HTMLElement>('#chrome')!;
        const inside = document.querySelector<HTMLElement>('#inside')!;
        const chromeRoot = chrome.attachShadow({ mode: 'open' });
        const insideRoot = inside.attachShadow({ mode: 'open' });
        const nestedHost = document.createElement('nested-reader-host');
        insideRoot.append(nestedHost);
        const nestedRoot = nestedHost.attachShadow({ mode: 'open' });
        const nestedText = document.createTextNode('日本語');
        nestedRoot.append(nestedText);
        expect(nodeWithinAnnotationScope(chromeRoot)).toBe(true);
        activateScope();
        expect(nodeWithinAnnotationScope(chrome)).toBe(false);
        expect(nodeWithinAnnotationScope(chromeRoot)).toBe(false);
        expect(nodeWithinAnnotationScope(inside)).toBe(true);
        expect(nodeWithinAnnotationScope(insideRoot)).toBe(true);
        expect(nodeWithinAnnotationScope(nestedText)).toBe(true);
    });

    it('detects mutations that can expand scoped shadow-root membership', () => {
        activateScope();
        document.body.innerHTML = '<section data-yomu-runtime-surface id="surface"></section><div id="outside"></div>';
        const surface = document.querySelector<HTMLElement>('#surface')!;
        const outside = document.querySelector<HTMLElement>('#outside')!;
        surface.append(outside);
        const movedInside = {
            type: 'childList',
            target: surface,
            addedNodes: [outside] as unknown as NodeList,
        } as unknown as MutationRecord;
        expect(mutationMayExpandAnnotationScope(movedInside)).toBe(true);

        const declared = document.createElement('div');
        declared.dataset.yomuRuntimeSurface = '';
        document.body.append(declared);
        expect(mutationMayExpandAnnotationScope({
            type: 'attributes',
            target: declared,
            attributeName: 'data-yomu-runtime-surface',
        } as unknown as MutationRecord)).toBe(true);

        expect(mutationMayExpandAnnotationScope({
            type: 'attributes',
            target: document.body,
            attributeName: 'class',
        } as unknown as MutationRecord)).toBe(false);
    });
});

describe('annotation scope in the generic scan pipeline', () => {
    const GENERIC_URL = 'https://example.com/';

    it('applies declared surfaces to the real startup Japanese verdict', () => {
        activateScope();
        document.body.innerHTML = `
            <nav>はじめる</nav>
            <section data-yomu-runtime-surface>Loading</section>
        `;
        expect(detectReaderStartupJapaneseText()).toBe(false);
        document.querySelector<HTMLElement>('[data-yomu-runtime-surface]')!.textContent = '日本語を読む';
        expect(detectReaderStartupJapaneseText()).toBe(true);
    });

    it('restricts collection to declared surfaces', () => {
        const restore = mockVisibleElementRects();
        activateScope();
        document.body.innerHTML = `
            <nav><a href="/x">はじめる</a></nav>
            <article><p>今日は静かな喫茶店で新しい本を読みました。</p></article>
            <section data-yomu-runtime-surface><p>吾輩は猫である。名前はまだ無い。</p></section>
        `;
        try {
            const texts = collectScanTargets(80, GENERIC_URL).map(target => target.text);
            expect(texts.some(text => text.includes('吾輩は猫である'))).toBe(true);
            expect(texts.some(text => text.includes('今日は静かな喫茶店'))).toBe(false);
            expect(texts.some(text => text.includes('はじめる'))).toBe(false);
        } finally {
            restore();
        }
    });

    it('does not escape to the global fallback on a later scan after the surface is already annotated', () => {
        const restore = mockVisibleElementRects();
        activateScope();
        document.body.innerHTML = `
            <article><p>今日は静かな喫茶店で新しい本を読みました。</p></article>
            <section data-yomu-runtime-surface>
                <span class="jpdb-reader-word" data-expression="吾輩">吾輩</span>
            </section>
        `;
        try {
            expect(collectScanTargets(80, GENERIC_URL)).toEqual([]);
        } finally {
            restore();
        }
    });

    it('preserves whole-page collection for pages that do not opt in', () => {
        const restore = mockVisibleElementRects();
        document.body.innerHTML = `
            <nav><a href="/x">はじめる</a></nav>
            <article><p>今日は静かな喫茶店で新しい本を読みました。</p></article>
            <section data-yomu-runtime-surface><p>吾輩は猫である。名前はまだ無い。</p></section>
        `;
        try {
            const texts = collectScanTargets(80, GENERIC_URL).map(target => target.text);
            expect(texts.some(text => text.includes('吾輩は猫である'))).toBe(true);
            expect(texts.some(text => text.includes('今日は静かな喫茶店'))).toBe(true);
            expect(texts.some(text => text.includes('はじめる'))).toBe(true);
        } finally {
            restore();
        }
    });
});
