import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    clearProjectedReadings,
    clearProjectedReadingsWithin,
    syncProjectedReadings,
} from '../../src/reader/dom/detached-reading-overlay-impl';
import { collectTextTargetsIn } from '../../src/reader/dom';
import { unwrapReaderWords } from '../../src/reader/dom/reader-word';

function rect(left = 20, top = 20, width = 40, height = 16): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

function readingOwner(text: string): {
    anchor: HTMLElement;
    owner: HTMLElement;
    source: HTMLElement;
} {
    const anchor = document.createElement('div');
    const owner = document.createElement('span');
    const source = document.createElement('span');
    source.textContent = text;
    owner.append(source);
    anchor.append(owner);
    anchor.getBoundingClientRect = () => rect();
    document.body.append(anchor);
    return { anchor, owner, source };
}

function mockElementsFromPoint(elements: Element[]): void {
    Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: vi.fn(() => elements),
    });
}

function projectedReading(text: string): HTMLElement | undefined {
    return [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
        .find(reading => reading.textContent === text);
}

async function nextProjectionFrame(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'elementsFromPoint');
    document.documentElement.classList.remove('yomu-furi-hover');
    document.body.innerHTML = '';
});

describe('detached reading overlay occlusion', () => {
    it('hides a projection covered by an unrelated page surface', () => {
        const background = readingOwner('はいけい');
        const menu = document.createElement('div');
        menu.style.backgroundColor = 'rgb(0, 0, 0)';
        document.body.append(menu);
        mockElementsFromPoint([menu, background.anchor]);

        syncProjectedReadings(background.owner, [{
            source: background.source,
            anchor: background.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('はいけい')?.style.display).toBe('none');
        clearProjectedReadings(background.owner);
    });

    it('hides a projection when only its predicted reading footprint is covered', () => {
        const background = readingOwner('よみ');
        const menu = document.createElement('div');
        menu.style.backgroundColor = 'rgb(0, 0, 0)';
        document.body.append(menu);
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn((_x: number, y: number) => (
                y < 20 ? [menu, background.anchor] : [background.anchor]
            )),
        });

        syncProjectedReadings(background.owner, [{
            source: background.source,
            anchor: background.anchor,
            rect: rect(20, 20),
            measure: () => rect(20, 20),
        }]);

        expect(projectedReading('よみ')?.style.display).toBe('none');
        clearProjectedReadings(background.owner);
    });

    it('allows a reading footprint to escape into otherwise blank page space', () => {
        const target = readingOwner('そと');
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn((_x: number, y: number) => (
                y < 20 ? [document.body] : [target.anchor]
            )),
        });

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(20, 20),
            measure: () => rect(20, 20),
        }]);

        expect(projectedReading('そと')?.style.display).toBe('block');
        clearProjectedReadings(target.owner);
    });

    it('stops at the foreground ancestor that owns the reading before inspecting its scrim', () => {
        const sheet = document.createElement('div');
        const target = readingOwner('ばい');
        const scrim = document.createElement('div');
        scrim.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
        sheet.append(target.anchor);
        document.body.append(scrim, sheet);
        mockElementsFromPoint([sheet, scrim]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('ばい')?.style.display).toBe('block');
        clearProjectedReadings(target.owner);
    });

    it('does not treat an adjacent decorated word on the same render surface as a foreground menu', () => {
        const surface = document.createElement('div');
        const owner = document.createElement('span');
        owner.className = 'jpdb-reader-word';
        const source = document.createElement('span');
        source.textContent = 'じゅん';
        owner.append(source);
        const sibling = document.createElement('span');
        sibling.className = 'jpdb-reader-word';
        sibling.style.backgroundColor = 'rgb(53, 158, 255)';
        surface.append(owner, sibling);
        owner.getBoundingClientRect = () => rect();
        surface.getBoundingClientRect = () => rect();
        document.body.append(surface);
        mockElementsFromPoint([sibling, surface]);

        syncProjectedReadings(owner, [{
            source,
            anchor: owner,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('じゅん')?.style.display).toBe('block');
        clearProjectedReadings(owner);
    });

    it.each([
        ['rgba(0, 0, 0, 0)', 'block'],
        ['rgba(0, 0, 0, 0.5)', 'none'],
        ['rgb(0 0 0 / 50%)', 'none'],
    ])('treats page-surface color %s by its real alpha', (backgroundColor, display) => {
        const target = readingOwner('あるふぁ');
        const surface = document.createElement('div');
        document.body.append(surface);
        mockElementsFromPoint([surface, target.anchor]);
        const getComputedStyle = window.getComputedStyle.bind(window);
        vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
            const style = getComputedStyle(element, pseudoElement);
            if (element !== surface) return style;
            return new Proxy(style, {
                get(value, property, receiver) {
                    if (property === 'backgroundColor') return backgroundColor;
                    if (property === 'backgroundImage') return 'none';
                    return Reflect.get(value, property, receiver);
                },
            });
        });

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('あるふぁ')?.style.display).toBe(display);
        clearProjectedReadings(target.owner);
    });

    it('keeps a menu projection visible through composed shadow ancestry', () => {
        const menuHost = document.createElement('div');
        const menuRoot = menuHost.attachShadow({ mode: 'open' });
        const menuRow = document.createElement('div');
        const owner = document.createElement('span');
        const source = document.createElement('span');
        source.textContent = 'じゅん';
        owner.append(source);
        menuRow.append(owner);
        menuRow.getBoundingClientRect = () => rect();
        menuRoot.append(menuRow);
        document.body.append(menuHost);
        mockElementsFromPoint([menuHost]);

        syncProjectedReadings(owner, [{
            source,
            anchor: menuRow,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('じゅん')?.style.display).toBe('block');
        clearProjectedReadings(owner);
    });

    it.each([
        ['display', 'none'],
        ['visibility', 'hidden'],
        ['opacity', '0'],
        ['content-visibility', 'hidden'],
    ])('hides a projection when its anchor has %s: %s', (property, value) => {
        const hidden = readingOwner('かくす');
        hidden.anchor.style.setProperty(property, value);
        mockElementsFromPoint([hidden.anchor]);

        syncProjectedReadings(hidden.owner, [{
            source: hidden.source,
            anchor: hidden.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('かくす')?.style.display).toBe('none');
        clearProjectedReadings(hidden.owner);
    });

    it('marks the portal as scan-ignored before mutation collection can see its clone', async () => {
        document.querySelector('.jpdb-reader-detached-reading-overlay')?.remove();
        const target = readingOwner('とうこう');
        mockElementsFromPoint([target.anchor]);
        const mutationTargets: string[] = [];
        const observer = new MutationObserver(records => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    mutationTargets.push(...collectTextTargetsIn(node, 20, false).map(item => item.text));
                }
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);
        await new Promise(resolve => setTimeout(resolve, 0));
        observer.disconnect();

        const layer = document.querySelector<HTMLElement>('.jpdb-reader-detached-reading-overlay');
        expect(layer?.getAttribute('data-jpdb-reader-surface-ignore')).toBe('true');
        expect(collectTextTargetsIn(layer!, 20, false)).toEqual([]);
        expect(mutationTargets).toEqual([]);
        clearProjectedReadings(target.owner);
    });

    it('batches every scroll read before writing projected clone positions', async () => {
        const first = readingOwner('ひとつ');
        const second = readingOwner('ふたつ');
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn((x: number) => [x < 60 ? first.anchor : second.anchor]),
        });
        const events: string[] = [];
        syncProjectedReadings(first.owner, [{
            source: first.source,
            anchor: first.anchor,
            rect: rect(20),
            measure: () => {
                events.push('read:first');
                return rect(20);
            },
        }]);
        syncProjectedReadings(second.owner, [{
            source: second.source,
            anchor: second.anchor,
            rect: rect(80),
            measure: () => {
                events.push('read:second');
                return rect(80);
            },
        }]);
        for (const text of ['ひとつ', 'ふたつ']) {
            const style = projectedReading(text)!.style;
            const setProperty = style.setProperty.bind(style);
            vi.spyOn(style, 'setProperty').mockImplementation((...args) => {
                events.push(`write:${text}`);
                setProperty(...args);
            });
        }

        document.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        const firstWrite = events.findIndex(event => event.startsWith('write:'));
        expect(events.slice(0, firstWrite)).toEqual(['read:first', 'read:second']);
        clearProjectedReadings(first.owner);
        clearProjectedReadings(second.owner);
    });

    it('remeasures a projection when a composed shadow ancestor scrolls', async () => {
        const host = document.createElement('dynamic-platform');
        const shadow = host.attachShadow({ mode: 'open' });
        const scroller = document.createElement('div');
        const component = document.createElement('dynamic-component');
        const componentShadow = component.attachShadow({ mode: 'open' });
        const target = readingOwner('どうてき');
        target.anchor.remove();
        componentShadow.append(target.anchor);
        scroller.append(component);
        shadow.append(scroller);
        document.body.append(host);
        mockElementsFromPoint([host]);
        Object.defineProperty(shadow, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn(() => [component]),
        });
        Object.defineProperty(componentShadow, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn(() => [target.anchor]),
        });
        let sourceRect = rect(80, 120);
        target.anchor.getBoundingClientRect = () => sourceRect;
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: sourceRect,
            measure: () => sourceRect,
        }]);
        expect(projectedReading('どうてき')?.style.top).toBe('120px');
        await nextProjectionFrame();

        sourceRect = rect(80, 60);
        scroller.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        expect(projectedReading('どうてき')?.style.top).toBe('60px');
        clearProjectedReadings(target.owner);
    });

    it('tracks the shadow scroller that renders a slotted light-DOM projection', async () => {
        const host = document.createElement('dynamic-platform');
        const shadow = host.attachShadow({ mode: 'open' });
        const scroller = document.createElement('div');
        const slot = document.createElement('slot');
        slot.name = 'label';
        scroller.append(slot);
        shadow.append(scroller);
        const target = readingOwner('すろっと');
        target.anchor.remove();
        target.anchor.slot = 'label';
        host.append(target.anchor);
        document.body.append(host);
        expect(target.anchor.assignedSlot).toBe(slot);
        mockElementsFromPoint([document.body]);
        let sourceRect = rect(80, 120);
        target.anchor.getBoundingClientRect = () => sourceRect;
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: sourceRect,
            measure: () => sourceRect,
        }]);
        await nextProjectionFrame();

        sourceRect = rect(80, 60);
        scroller.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();
        expect(projectedReading('すろっと')?.style.top).toBe('60px');

        sourceRect = rect(80, 40);
        slot.dispatchEvent(new Event('slotchange'));
        await nextProjectionFrame();
        expect(projectedReading('すろっと')?.style.top).toBe('40px');
        clearProjectedReadings(target.owner);
    });

    it('tracks every shadow boundary when slotted hosts are nested', async () => {
        const platform = document.createElement('dynamic-platform');
        const platformRoot = platform.attachShadow({ mode: 'open' });
        const scroller = document.createElement('div');
        const platformSlot = document.createElement('slot');
        platformSlot.name = 'component';
        scroller.append(platformSlot);
        platformRoot.append(scroller);
        const component = document.createElement('dynamic-component');
        component.slot = 'component';
        const componentRoot = component.attachShadow({ mode: 'open' });
        const componentSlot = document.createElement('slot');
        componentSlot.name = 'label';
        componentRoot.append(componentSlot);
        platform.append(component);
        const target = readingOwner('にじゅう');
        target.anchor.remove();
        target.anchor.slot = 'label';
        component.append(target.anchor);
        document.body.append(platform);
        expect(component.assignedSlot).toBe(platformSlot);
        expect(target.anchor.assignedSlot).toBe(componentSlot);
        mockElementsFromPoint([document.body]);
        let sourceRect = rect(80, 120);
        target.anchor.getBoundingClientRect = () => sourceRect;
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: sourceRect,
            measure: () => sourceRect,
        }]);
        await nextProjectionFrame();

        sourceRect = rect(80, 60);
        scroller.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();
        expect(projectedReading('にじゅう')?.style.top).toBe('60px');
        clearProjectedReadings(target.owner);
    });

    it('adopts a newly matching slot without requiring another annotation sync', async () => {
        const host = document.createElement('dynamic-platform');
        const shadow = host.attachShadow({ mode: 'open' });
        const scroller = document.createElement('div');
        const slot = document.createElement('slot');
        slot.name = 'other';
        scroller.append(slot);
        shadow.append(scroller);
        const target = readingOwner('あとから');
        target.anchor.remove();
        target.anchor.slot = 'label';
        host.append(target.anchor);
        document.body.append(host);
        expect(target.anchor.assignedSlot).toBeNull();
        mockElementsFromPoint([document.body]);
        let sourceRect = rect(80, 120);
        target.anchor.getBoundingClientRect = () => sourceRect;
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: sourceRect,
            measure: () => sourceRect,
        }]);
        await nextProjectionFrame();

        sourceRect = rect(80, 80);
        slot.name = 'label';
        await nextProjectionFrame();
        expect(target.anchor.assignedSlot).toBe(slot);
        expect(projectedReading('あとから')?.style.top).toBe('80px');

        sourceRect = rect(80, 60);
        scroller.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();
        expect(projectedReading('あとから')?.style.top).toBe('60px');
        clearProjectedReadings(target.owner);
    });

    it('retracks a moved projection before listening to its new shadow scroller', async () => {
        const firstHost = document.createElement('dynamic-platform');
        const firstRoot = firstHost.attachShadow({ mode: 'open' });
        const firstScroller = document.createElement('div');
        firstRoot.append(firstScroller);
        const secondHost = document.createElement('dynamic-platform');
        const secondRoot = secondHost.attachShadow({ mode: 'open' });
        const secondScroller = document.createElement('div');
        secondRoot.append(secondScroller);
        document.body.append(firstHost, secondHost);
        const removeFirstListener = vi.spyOn(firstRoot, 'removeEventListener');
        const addSecondListener = vi.spyOn(secondRoot, 'addEventListener');
        const target = readingOwner('うつる');
        target.anchor.remove();
        firstScroller.append(target.anchor);
        mockElementsFromPoint([document.body]);
        let sourceRect = rect(80, 120);
        target.anchor.getBoundingClientRect = () => sourceRect;
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: sourceRect,
            measure: () => sourceRect,
        }]);
        await nextProjectionFrame();

        // Moving the existing annotation itself must be enough; frameworks do
        // not necessarily ask Yomu to sync the same reading again.
        secondScroller.append(target.anchor);
        await nextProjectionFrame();
        expect(removeFirstListener).toHaveBeenCalledWith(
            'scroll',
            expect.any(Function),
            { capture: true },
        );
        expect(removeFirstListener).toHaveBeenCalledWith(
            'slotchange',
            expect.any(Function),
            { capture: true },
        );
        expect(addSecondListener).toHaveBeenCalledWith(
            'scroll',
            expect.any(Function),
            { capture: true, passive: true },
        );
        expect(addSecondListener).toHaveBeenCalledWith(
            'slotchange',
            expect.any(Function),
            { capture: true, passive: true },
        );

        sourceRect = rect(80, 60);
        secondScroller.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();
        expect(projectedReading('うつる')?.style.top).toBe('60px');
        clearProjectedReadings(target.owner);
    });

    it.each(['resize', 'orientationchange'])(
        'remeasures projected readings after viewport %s',
        async eventName => {
            const target = readingOwner('ばい');
            mockElementsFromPoint([target.anchor]);
            let sourceRect = rect(80);
            syncProjectedReadings(target.owner, [{
                source: target.source,
                anchor: target.anchor,
                rect: sourceRect,
                measure: () => sourceRect,
            }]);
            expect(projectedReading('ばい')?.style.left).toBe('100px');

            sourceRect = rect(180);
            window.dispatchEvent(new Event(eventName));
            await nextProjectionFrame();

            expect(projectedReading('ばい')?.style.left).toBe('200px');
            clearProjectedReadings(target.owner);
        },
    );

    it('refreshes occlusion after an opaque page surface is mounted', async () => {
        const background = readingOwner('うしろ');
        const menu = document.createElement('div');
        menu.style.backgroundColor = 'rgb(0, 0, 0)';
        let menuOpen = false;
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn((_x: number, y: number) => (
                menuOpen && y < 20 ? [menu, background.anchor] : [background.anchor]
            )),
        });
        syncProjectedReadings(background.owner, [{
            source: background.source,
            anchor: background.anchor,
            rect: rect(20, 20),
            measure: () => rect(20, 20),
        }]);
        expect(projectedReading('うしろ')?.style.display).toBe('block');

        menuOpen = true;
        document.body.append(menu);
        await nextProjectionFrame();

        expect(projectedReading('うしろ')?.style.display).toBe('none');
        clearProjectedReadings(background.owner);
    });

    it('refreshes older projections when a foreground shadow menu is annotated', async () => {
        const background = readingOwner('うしろ');
        const menuHost = document.createElement('div');
        const shadow = menuHost.attachShadow({ mode: 'open' });
        const menuSurface = document.createElement('div');
        menuSurface.style.backgroundColor = 'rgb(0, 0, 0)';
        shadow.append(menuSurface);
        const transparentOverlay = document.createElement('div');
        document.body.append(menuHost, transparentOverlay);
        let menuOpen = false;
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn((_x: number, y: number) => (
                menuOpen && y < 20
                    ? [transparentOverlay, menuHost, background.anchor]
                    : [background.anchor]
            )),
        });
        Object.defineProperty(shadow, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn(() => [menuSurface]),
        });
        syncProjectedReadings(background.owner, [{
            source: background.source,
            anchor: background.anchor,
            rect: rect(20, 20),
            measure: () => rect(20, 20),
        }]);
        expect(projectedReading('うしろ')?.style.display).toBe('block');

        const menu = readingOwner('めにゅー');
        menu.anchor.remove();
        menu.anchor.getBoundingClientRect = () => rect(80, 40);
        menuSurface.append(menu.anchor);
        menuOpen = true;
        syncProjectedReadings(menu.owner, [{
            source: menu.source,
            anchor: menu.anchor,
            rect: rect(80, 40),
            measure: () => rect(80, 40),
        }]);
        await nextProjectionFrame();

        expect(projectedReading('うしろ')?.style.display).toBe('none');
        expect(projectedReading('めにゅー')?.style.display).toBe('block');
        clearProjectedReadings(background.owner);
        clearProjectedReadings(menu.owner);
    });

    it('refreshes when an English-only opaque menu toggles in an observed shadow root', async () => {
        const background = readingOwner('うしろ');
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const trigger = readingOwner('ならび');
        trigger.anchor.remove();
        trigger.anchor.getBoundingClientRect = () => rect(80, 40);
        shadow.append(trigger.anchor);
        const englishMenu = document.createElement('div');
        englishMenu.textContent = 'Sort by';
        englishMenu.style.cssText = 'display: none; background-color: rgb(0, 0, 0)';
        shadow.append(englishMenu);
        document.body.append(host);
        let menuOpen = false;
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn((_x: number, y: number) => (
                menuOpen && y < 20 ? [host, background.anchor] : [background.anchor]
            )),
        });
        Object.defineProperty(shadow, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn(() => menuOpen ? [englishMenu] : [trigger.anchor]),
        });
        syncProjectedReadings(background.owner, [{
            source: background.source,
            anchor: background.anchor,
            rect: rect(20, 20),
            measure: () => rect(20, 20),
        }]);
        syncProjectedReadings(trigger.owner, [{
            source: trigger.source,
            anchor: trigger.anchor,
            rect: rect(80, 40),
            measure: () => rect(80, 40),
        }]);
        await nextProjectionFrame();
        expect(projectedReading('うしろ')?.style.display).toBe('block');

        menuOpen = true;
        englishMenu.style.display = 'block';
        await nextProjectionFrame();

        expect(projectedReading('うしろ')?.style.display).toBe('none');
        clearProjectedReadings(background.owner);
        clearProjectedReadings(trigger.owner);
    });

    it('prunes a detached shadow projection and releases its observed root', async () => {
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const target = readingOwner('はずす');
        target.anchor.remove();
        target.anchor.getBoundingClientRect = () => rect();
        shadow.append(target.anchor);
        document.body.append(host);
        mockElementsFromPoint([host]);
        Object.defineProperty(shadow, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn(() => [target.anchor]),
        });
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);
        expect(projectedReading('はずす')).toBeDefined();

        host.remove();
        await nextProjectionFrame();

        expect(projectedReading('はずす')).toBeUndefined();
        const staleMutation = document.createElement('div');
        shadow.append(staleMutation);
        staleMutation.className = 'changed-after-detach';
        await nextProjectionFrame();
        expect(projectedReading('はずす')).toBeUndefined();
    });

    it('retracks the same anchor when a framework moves it between shadow roots', async () => {
        const background = readingOwner('うしろ');
        const firstHost = document.createElement('div');
        const firstRoot = firstHost.attachShadow({ mode: 'open' });
        const secondHost = document.createElement('div');
        const secondRoot = secondHost.attachShadow({ mode: 'open' });
        document.body.append(firstHost, secondHost);
        const target = readingOwner('うごく');
        target.anchor.remove();
        target.anchor.getBoundingClientRect = () => rect(80, 40);
        firstRoot.append(target.anchor);
        const menu = document.createElement('div');
        menu.style.cssText = 'display: none; background-color: rgb(0, 0, 0)';
        secondRoot.append(menu);
        let menuOpen = false;
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn((_x: number, y: number) => (
                menuOpen && y < 20 ? [secondHost, background.anchor] : [background.anchor]
            )),
        });
        Object.defineProperty(secondRoot, 'elementsFromPoint', {
            configurable: true,
            value: vi.fn(() => menuOpen ? [menu] : [target.anchor]),
        });
        syncProjectedReadings(background.owner, [{
            source: background.source,
            anchor: background.anchor,
            rect: rect(20, 20),
            measure: () => rect(20, 20),
        }]);
        const projection = {
            source: target.source,
            anchor: target.anchor,
            rect: rect(80, 40),
            measure: () => rect(80, 40),
        };
        syncProjectedReadings(target.owner, [projection]);

        secondRoot.append(target.anchor);
        syncProjectedReadings(target.owner, [projection]);
        menuOpen = true;
        menu.style.display = 'block';
        await nextProjectionFrame();

        expect(projectedReading('うしろ')?.style.display).toBe('none');
        expect(projectedReading('うごく')?.style.display).toBe('block');
        clearProjectedReadings(background.owner);
        clearProjectedReadings(target.owner);
    });

    it('reveals hover-mode projection from the real page anchor focus state', async () => {
        const target = readingOwner('ほばー');
        document.documentElement.classList.add('yomu-furi-hover');
        target.anchor.tabIndex = 0;
        target.source.style.visibility = 'hidden';
        mockElementsFromPoint([target.anchor]);
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);
        expect(projectedReading('ほばー')?.style.display).toBe('none');

        target.anchor.focus();
        await nextProjectionFrame();
        expect(projectedReading('ほばー')?.style.display).toBe('block');

        target.anchor.blur();
        await nextProjectionFrame();
        expect(projectedReading('ほばー')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    it('skips range measurement and hit-testing for offscreen owners on scroll', async () => {
        const target = readingOwner('そと');
        target.anchor.getBoundingClientRect = () => rect(20, 2_000);
        const elementsFromPoint = vi.fn(() => [target.anchor]);
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: elementsFromPoint,
        });
        const measure = vi.fn(() => rect(20, 2_000));
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(20, 2_000),
            measure,
        }]);
        elementsFromPoint.mockClear();

        document.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        expect(measure).not.toHaveBeenCalled();
        expect(elementsFromPoint).not.toHaveBeenCalled();
        expect(projectedReading('そと')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    it('computes shared anchor visibility once per refresh', async () => {
        const target = readingOwner('ひとつ');
        const secondSource = document.createElement('span');
        secondSource.textContent = 'ふたつ';
        target.owner.append(secondSource);
        mockElementsFromPoint([target.anchor]);
        syncProjectedReadings(target.owner, [
            {
                source: target.source,
                anchor: target.anchor,
                rect: rect(20),
                measure: () => rect(20),
            },
            {
                source: secondSource,
                anchor: target.anchor,
                rect: rect(80),
                measure: () => rect(80),
            },
        ]);
        const getComputedStyle = window.getComputedStyle.bind(window);
        const styleReads = vi.spyOn(window, 'getComputedStyle')
            .mockImplementation((element, pseudoElement) => getComputedStyle(element, pseudoElement));

        document.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        expect(styleReads.mock.calls.filter(([element]) => element === target.anchor)).toHaveLength(1);
        clearProjectedReadings(target.owner);
    });

    it('clears every projected reading owned by a document', () => {
        const target = readingOwner('ぜんぶ');
        mockElementsFromPoint([target.anchor]);
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('ぜんぶ')).toBeDefined();
        expect(clearProjectedReadingsWithin(document)).toBe(1);
        expect(projectedReading('ぜんぶ')).toBeUndefined();
    });

    it('clears only projected readings contained by a scoped root', () => {
        const first = readingOwner('ひとつ');
        const second = readingOwner('ふたつ');
        mockElementsFromPoint([first.anchor, second.anchor]);
        for (const target of [first, second]) {
            syncProjectedReadings(target.owner, [{
                source: target.source,
                anchor: target.anchor,
                rect: rect(),
                measure: () => rect(),
            }]);
        }

        expect(clearProjectedReadingsWithin(first.anchor)).toBe(1);
        expect(projectedReading('ひとつ')).toBeUndefined();
        expect(projectedReading('ふたつ')).toBeDefined();
        clearProjectedReadings(second.owner);
    });

    it('removes a word projection before unwrapping its reader markup', () => {
        const container = document.createElement('div');
        container.innerHTML = `
            <span class="jpdb-reader-word">
                <span class="jpdb-reader-detached-ruby">
                    <span class="jpdb-reader-ruby-base">投票</span>
                    <span class="jpdb-reader-furi jpdb-reader-detached-furi">とうひょう</span>
                </span>
            </span>
        `;
        document.body.append(container);
        const word = container.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const source = word.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
        mockElementsFromPoint([word]);
        syncProjectedReadings(word, [{
            source,
            anchor: word,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('とうひょう')).toBeDefined();
        expect(unwrapReaderWords(container, { includeReaderRoot: true })).toBe(1);
        expect(projectedReading('とうひょう')).toBeUndefined();
        expect(container.textContent?.trim()).toBe('投票');
    });

    it('keeps an excluded sibling projection when partially unwrapping a mirror', () => {
        const mirror = document.createElement('div');
        mirror.className = 'jpdb-reader-additive-text-mirror';
        mirror.innerHTML = `
            <span id="first">
                <span class="jpdb-reader-word">
                    <span class="jpdb-reader-ruby-base">投票</span>
                    <span class="jpdb-reader-furi jpdb-reader-detached-furi">とうひょう</span>
                </span>
            </span>
            <span id="second">
                <span class="jpdb-reader-word">
                    <span class="jpdb-reader-ruby-base">時間</span>
                    <span class="jpdb-reader-furi jpdb-reader-detached-furi">じかん</span>
                </span>
            </span>
        `;
        mirror.getBoundingClientRect = () => rect();
        document.body.append(mirror);
        const sources = [...mirror.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')];
        mockElementsFromPoint([mirror]);
        syncProjectedReadings(mirror, sources.map((source, index) => ({
            source,
            anchor: mirror,
            rect: rect(20 + index * 60),
            measure: () => rect(20 + index * 60),
        })));

        const first = mirror.querySelector<HTMLElement>('#first')!;
        expect(unwrapReaderWords(first, { includeReaderRoot: true })).toBe(1);
        expect(projectedReading('とうひょう')).toBeUndefined();
        expect(projectedReading('じかん')).toBeDefined();
        clearProjectedReadings(mirror);
    });
});

describe('detached reading scroll context', () => {
    function makeScroller(overflow = 'auto'): HTMLElement {
        const scroller = document.createElement('div');
        // jsdom does not expand the overflow shorthand into longhands, so set
        // the axis the projection actually consults.
        scroller.style.overflowY = overflow;
        Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
        Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 400 });
        return scroller;
    }

    function projectInto(host: HTMLElement | null, text: string): HTMLElement {
        const target = readingOwner(text);
        if (host) {
            document.body.append(host);
            host.append(target.anchor);
        }
        mockElementsFromPoint([target.anchor]);
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);
        return projectedReading(text)!;
    }

    // A word on the ordinary page rides the document scroller, so its reading
    // is stamped in page space and the compositor carries the two together —
    // a refresh frame that never arrives can no longer strand the reading.
    it('anchors a reading on plain page text in document space', () => {
        const reading = projectInto(null, 'ふつう');
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(true);
        expect(reading.parentElement?.classList.contains('jpdb-reader-detached-reading-document-layer'))
            .toBe(true);
    });

    it('keeps a reading inside an inner scroller on the viewport layer', () => {
        const reading = projectInto(makeScroller(), 'なか');
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
        expect(reading.parentElement?.classList.contains('jpdb-reader-detached-reading-document-layer'))
            .toBe(false);
    });

    // An overflow:hidden box still scrolls when script sets scrollTop, so it
    // has to disqualify document space the same way a visible scroller does.
    it('keeps a reading inside a clipped scrollable box on the viewport layer', () => {
        const reading = projectInto(makeScroller('hidden'), 'かくれ');
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
    });

    it.each(['fixed', 'sticky'])('keeps a reading under a %s ancestor on the viewport layer', position => {
        const pinned = document.createElement('div');
        pinned.style.position = position;
        const reading = projectInto(pinned, `ぴん${position}`);
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
    });

    it('re-decides the layer when the word gains a scrolling ancestor', async () => {
        const target = readingOwner('いどう');
        mockElementsFromPoint([target.anchor]);
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);
        expect(projectedReading('いどう')?.classList.contains('jpdb-reader-projected-furi-document'))
            .toBe(true);

        const scroller = makeScroller();
        document.body.append(scroller);
        scroller.append(target.anchor);
        await nextProjectionFrame();

        expect(projectedReading('いどう')?.classList.contains('jpdb-reader-projected-furi-document'))
            .toBe(false);
        clearProjectedReadings(target.owner);
    });

    // Document-space readings are absolutely positioned, so the layer holding
    // them must never contribute to the page's own scrollable area.
    it('keeps the document layer out of page layout', () => {
        projectInto(null, 'そとわく');
        const layer = document.querySelector<HTMLElement>('.jpdb-reader-detached-reading-document-layer');
        expect(layer?.isConnected).toBe(true);
        expect(layer?.parentElement).toBe(document.documentElement);
    });
});

// Firefox enforces a WebIDL receiver check on requestAnimationFrame: calling it
// without a real Window `this` throws. In the page world a detached free call
// still resolves a Window global, so the bug is invisible there — it only bites
// inside a userscript-manager sandbox (Tampermonkey on Firefox), which is where
// the user hit it. This stubs Gecko's check so the regression is deterministic.
describe('projected reading refresh under a Firefox userscript sandbox', () => {
    // Scrolling something that holds no reading cannot have moved one, so the
    // refresh is skipped. The safety property is the other direction: every
    // scroller that DOES hold a reading must still refresh, including across a
    // shadow boundary, or readings freeze mid-page (the 1.8.2/1.8.3 bug class).
    describe('scroll refresh scoping', () => {
        function countRefreshFrames(): { frames: number; restore: () => void } {
            const view = window as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number };
            const original = view.requestAnimationFrame;
            const state = { frames: 0, restore: () => { view.requestAnimationFrame = original; } };
            view.requestAnimationFrame = ((callback: FrameRequestCallback) => {
                state.frames += 1;
                return original.call(window, callback);
            }) as typeof view.requestAnimationFrame;
            return state;
        }

        // syncProjectedReadings leaves a coalesced frame pending, and
        // scheduleProjectionRefresh is a no-op while one is in flight. Let it
        // run before counting or every case reads as "no refresh".
        async function flushPendingFrame(): Promise<void> {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        }

        it('refreshes when the scrolled element contains the reading', async () => {
            const target = readingOwner('日本語');
            mockElementsFromPoint([target.source]);
            syncProjectedReadings(target.owner, [{
                source: target.source, anchor: target.anchor, rect: rect(), measure: () => rect(),
            }]);
            await flushPendingFrame();
            const counter = countRefreshFrames();
            try {
                target.anchor.dispatchEvent(new Event('scroll', { bubbles: false }));
                expect(counter.frames).toBeGreaterThan(0);
            } finally {
                counter.restore();
                clearProjectedReadings(target.owner);
                target.anchor.remove();
            }
        });

        it('refreshes when the reading sits inside a shadow root under the scroller', async () => {
            const scroller = document.createElement('div');
            const host = document.createElement('div');
            scroller.append(host);
            document.body.append(scroller);
            const shadow = host.attachShadow({ mode: 'open' });
            const anchor = document.createElement('div');
            const owner = document.createElement('span');
            const source = document.createElement('span');
            source.textContent = '影';
            owner.append(source);
            anchor.append(owner);
            anchor.getBoundingClientRect = () => rect();
            shadow.append(anchor);
            mockElementsFromPoint([source]);
            syncProjectedReadings(owner, [{ source, anchor, rect: rect(), measure: () => rect() }]);

            await flushPendingFrame();
            const counter = countRefreshFrames();
            try {
                scroller.dispatchEvent(new Event('scroll', { bubbles: false }));
                expect(counter.frames).toBeGreaterThan(0);
            } finally {
                counter.restore();
                clearProjectedReadings(owner);
                scroller.remove();
            }
        });

        it('skips the refresh for a scroller that holds no reading', async () => {
            const target = readingOwner('日本語');
            mockElementsFromPoint([target.source]);
            syncProjectedReadings(target.owner, [{
                source: target.source, anchor: target.anchor, rect: rect(), measure: () => rect(),
            }]);
            const unrelated = document.createElement('div');
            document.body.append(unrelated);

            await flushPendingFrame();
            const counter = countRefreshFrames();
            try {
                unrelated.dispatchEvent(new Event('scroll', { bubbles: false }));
                expect(counter.frames).toBe(0);
            } finally {
                counter.restore();
                clearProjectedReadings(target.owner);
                target.anchor.remove();
                unrelated.remove();
            }
        });

        it('still refreshes on a page-level scroll', async () => {
            const target = readingOwner('日本語');
            mockElementsFromPoint([target.source]);
            syncProjectedReadings(target.owner, [{
                source: target.source, anchor: target.anchor, rect: rect(), measure: () => rect(),
            }]);
            await flushPendingFrame();
            const counter = countRefreshFrames();
            try {
                document.documentElement.dispatchEvent(new Event('scroll', { bubbles: false }));
                expect(counter.frames).toBeGreaterThan(0);
            } finally {
                counter.restore();
                clearProjectedReadings(target.owner);
                target.anchor.remove();
            }
        });
    });

    // Keep this test last: its stub returns a frame id without ever running
    // the callback, so the overlay's coalescing guard stays armed and every
    // later scheduleProjectionRefresh in this file silently does nothing.
    it('calls requestAnimationFrame with its window as receiver', async () => {
        const view = document.defaultView!;
        // Let any frame scheduled by an earlier test settle, otherwise the
        // schedule guard short-circuits and this test exercises nothing.
        await new Promise<void>(resolve => view.requestAnimationFrame(() => resolve()));
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        const original = view.requestAnimationFrame;
        const receivers: unknown[] = [];
        const geckoLike = function (this: unknown, cb: FrameRequestCallback): number {
            receivers.push(this);
            // Exactly what Gecko throws for a receiver that is not a Window.
            if (this !== view) {
                throw new TypeError(
                    "'requestAnimationFrame' called on an object that does not implement interface Window.",
                );
            }
            void cb;
            return 1;
        };
        Object.defineProperty(view, 'requestAnimationFrame', {
            configurable: true, writable: true, value: geckoLike,
        });

        try {
            const target = readingOwner('日本語');
            mockElementsFromPoint([target.source]);
            // Must not throw, and must schedule with a Window receiver.
            expect(() => syncProjectedReadings(target.owner, [{
                source: target.source,
                anchor: target.anchor,
                rect: rect(),
                measure: () => rect(),
            }])).not.toThrow();
            expect(receivers.length).toBeGreaterThan(0);
            expect(receivers.every(r => r === view)).toBe(true);
            clearProjectedReadings(target.owner);
            target.anchor.remove();
        } finally {
            Object.defineProperty(view, 'requestAnimationFrame', {
                configurable: true, writable: true, value: original,
            });
        }
    });
});
