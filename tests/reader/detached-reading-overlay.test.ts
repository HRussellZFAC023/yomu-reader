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

    // A button stacks its own ripple/hover/focus layers as SIBLINGS of the
    // label, directly under where the reading is painted. Scoring those as a
    // covering surface blanks the reading, and because the in-word source is
    // display:none the clone is the only visible copy — so the button ends up
    // with an underline and no furigana at all, which is the reported bug.
    it('keeps a projection over its own control chrome', () => {
        const button = document.createElement('button');
        const target = readingOwner('さんか');
        button.append(target.anchor);
        document.body.append(button);
        const ripple = document.createElement('span');
        ripple.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        button.append(ripple);
        mockElementsFromPoint([ripple, button]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('さんか')?.style.display).toBe('block');
        clearProjectedReadings(target.owner);
    });

    it.each(['button', 'a'] as const)(
        'keeps a YouTube chrome portal reading over its own %s icon footprint',
        tagName => {
            const control = document.createElement(tagName);
            if (control instanceof HTMLAnchorElement) control.href = '/feed/subscriptions';
            control.getBoundingClientRect = () => rect(0, 0, 64, 48);
            const icon = document.createElement('span');
            icon.style.backgroundColor = 'rgb(255, 255, 255)';
            const anchor = document.createElement('span');
            anchor.textContent = '登録';
            anchor.getBoundingClientRect = () => rect(20, 20, 40, 16);
            control.append(icon, anchor);

            const owner = document.createElement('span');
            owner.className = 'jpdb-reader-text-mirror jpdb-reader-youtube-chrome-portal';
            const source = document.createElement('span');
            source.textContent = 'とうろく';
            owner.append(source);
            document.body.append(control, owner);
            Object.defineProperty(document, 'elementsFromPoint', {
                configurable: true,
                value: vi.fn((_x: number, y: number) => (
                    y < 20 ? [icon, control] : [anchor, control]
                )),
            });

            syncProjectedReadings(owner, [{
                source,
                anchor,
                rect: rect(20, 20, 40, 16),
                measure: () => rect(20, 20, 40, 16),
            }]);

            expect(projectedReading('とうろく')?.style.display).toBe('block');
            clearProjectedReadings(owner);
        },
    );

    // The exemption is scoped to the control the word lives in: a real menu
    // drawn over that button still hides the reading, or readings would bleed
    // through dropdowns. The menu here is bare and translucent, so only the
    // scope decides it — and it sits inside the link wrapped around the whole
    // card, which is why a bare `a` may never join the control selector.
    it('still hides a projection under a surface outside its own control', () => {
        const card = document.createElement('a');
        const button = document.createElement('button');
        const target = readingOwner('きょひ');
        button.append(target.anchor);
        const menu = document.createElement('div');
        menu.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        card.append(button, menu);
        document.body.append(card);
        mockElementsFromPoint([menu, button]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('きょひ')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    // Inside the control the exemption stops at the control's own decoration.
    // A panel that renders content of its own is a real surface, and a reading
    // painted on top of it reads as nonsense over someone else's text. The
    // panel here is translucent, so only its content decides.
    it('still hides a projection under a panel inside its own control', () => {
        const control = document.createElement('div');
        control.setAttribute('role', 'button');
        const target = readingOwner('こんだて');
        control.append(target.anchor);
        const panel = document.createElement('div');
        panel.style.backgroundColor = 'rgba(30, 30, 30, 0.5)';
        panel.textContent = '選択';
        control.append(panel);
        document.body.append(control);
        mockElementsFromPoint([panel, control]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('こんだて')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    // Chrome is what a control's label reads through. An opaque layer is a
    // surface: a loading veil takes the word with it, and a reading painted
    // onto an opaque badge cannot be read at all.
    it('still hides a projection under an opaque layer inside its own control', () => {
        const button = document.createElement('button');
        const target = readingOwner('おおい');
        button.append(target.anchor);
        const veil = document.createElement('div');
        veil.style.backgroundColor = 'rgb(20, 20, 20)';
        button.append(veil);
        document.body.append(button);
        mockElementsFromPoint([veil, button]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('おおい')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    // A control can wrap a whole card — a tile, a radio card, a row with a
    // thumbnail. There is room above the label for real content there, so the
    // card's interior is not chrome however bare the covering layer looks.
    it('still hides a projection under a bare wash inside a card-sized control', () => {
        const card = document.createElement('div');
        card.setAttribute('role', 'button');
        card.getBoundingClientRect = () => rect(0, 0, 320, 200);
        const target = readingOwner('たいる');
        card.append(target.anchor);
        const wash = document.createElement('div');
        wash.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        card.append(wash);
        document.body.append(card);
        mockElementsFromPoint([wash, card]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('たいる')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    // Frameworks render the ripple inside the component's own shadow tree, so
    // node-tree containment never recognises it as the control's chrome.
    it('keeps a projection over control chrome rendered in a shadow tree', () => {
        const button = document.createElement('button');
        const target = readingOwner('ひかり');
        button.append(target.anchor);
        const rippleHost = document.createElement('div');
        const rippleRoot = rippleHost.attachShadow({ mode: 'open' });
        const ripple = document.createElement('span');
        ripple.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        rippleRoot.append(ripple);
        // jsdom has no layout, so the shadow hit test has to be supplied.
        Object.defineProperty(rippleRoot, 'elementsFromPoint', {
            configurable: true,
            value: () => [ripple],
        });
        button.append(rippleHost);
        document.body.append(button);
        mockElementsFromPoint([rippleHost, button]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('ひかり')?.style.display).toBe('block');
        clearProjectedReadings(target.owner);
    });

    // A press fill waiting at opacity 0 is in the hit list but paints nothing,
    // and treating it as a covering surface blanked the reading on every
    // control that stacks one over its label.
    it('keeps a projection under a layer that paints nothing', () => {
        const target = readingOwner('とうめい');
        const fill = document.createElement('div');
        fill.style.backgroundColor = 'rgb(0, 0, 0)';
        fill.style.opacity = '0';
        document.body.append(fill);
        mockElementsFromPoint([fill, target.anchor]);

        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);

        expect(projectedReading('とうめい')?.style.display).toBe('block');
        clearProjectedReadings(target.owner);
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

    it('rechecks a late projection after its source moves across a sticky surface', async () => {
        const targets = Array.from({ length: 13 }, (_, index) => readingOwner(`よみ${index}`));
        const late = targets.at(-1)!;
        const cover = document.createElement('div');
        cover.style.backgroundColor = 'rgb(0, 0, 0)';
        document.body.append(cover);
        let lateTop = 10;
        let lateCovered = true;
        let scrollDelta = 0;
        let lateMeasurable = true;

        const elementsFromPoint = vi.fn((x: number) => x > 380 && lateCovered
            ? [cover, late.anchor]
            : [late.anchor]);
        Object.defineProperty(document, 'elementsFromPoint', {
            configurable: true,
            value: elementsFromPoint,
        });

        targets.forEach((target, index) => {
            const measured = (): DOMRect | null => index === targets.length - 1
                ? (lateMeasurable ? rect(400, lateTop) : null)
                : rect(20 + index * 24, 120 + scrollDelta);
            target.anchor.getBoundingClientRect = () => index === targets.length - 1
                ? rect(400, lateTop)
                : rect(20 + index * 24, 120 + scrollDelta);
            syncProjectedReadings(target.owner, [{
                source: target.source,
                anchor: target.anchor,
                rect: measured()!,
                measure: measured,
            }]);
        });

        expect(projectedReading('よみ12')?.style.display).toBe('none');
        expect(elementsFromPoint.mock.calls.length).toBe(12 * 6);

        // The cacheless 13th record is still awaiting its first occlusion
        // check. A recycler measurement gap must not let grace paint it from
        // the unchecked source rect.
        lateMeasurable = false;
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(projectedReading('よみ12')?.style.display).toBe('none');

        lateMeasurable = true;
        lateTop = 160;
        lateCovered = false;
        scrollDelta = 40;
        elementsFromPoint.mockClear();
        document.dispatchEvent(new Event('scroll'));

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(projectedReading('よみ12')?.style.display).toBe('none');
        expect(elementsFromPoint.mock.calls.length).toBeLessThanOrEqual(12 * 6);

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        const recovered = projectedReading('よみ12');
        expect(recovered?.style.display).toBe('block');
        expect(Number(recovered?.dataset.yomuSourceTop)).toBe(160);

        lateTop = 10;
        lateCovered = true;
        scrollDelta = 80;
        elementsFromPoint.mockClear();
        document.dispatchEvent(new Event('scroll'));

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(recovered?.style.display).toBe('block');
        expect(elementsFromPoint.mock.calls.length).toBeLessThanOrEqual(12 * 6);

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

        expect(recovered?.style.display).toBe('none');
        targets.forEach(target => clearProjectedReadings(target.owner));
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

describe('detached reading grace termination', () => {
    // The refresh pump is event-driven. A pass that painted a stale clone from
    // its grace allowance used to depend on SOME later event to run the pass
    // that retires it — on a quiet page that pass never came, and the stale
    // clone floated at its last position with no word under it (the "stray
    // furigana over the logo" report). A grace paint now schedules its own
    // follow-up, so one event is enough for the clone to retire by itself.
    it('retires a stale clone after one event with no further activity', async () => {
        const target = readingOwner('まいご');
        mockElementsFromPoint([target.anchor]);
        let broken = false;
        const measure = () => (broken ? null : rect());
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure,
        }]);
        await nextProjectionFrame();
        expect(projectedReading('まいご')?.style.display).toBe('block');

        // The word is recycled away: measurement starts failing for good.
        broken = true;
        document.dispatchEvent(new Event('scroll'));
        // No further events — only the self-scheduled follow-ups may run.
        for (let i = 0; i < 6; i++) await nextProjectionFrame();

        expect(projectedReading('まいご')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    // A document-space clone is stamped through the layer origin of the pass
    // that paints it. Replaying the last good VIEWPORT rect through a scrolled
    // origin adds the whole scroll delta, which is how a bridged reading ended
    // up floating over unrelated content in a corner of the page.
    it('holds a bridged reading against its word while the page scrolls', async () => {
        const target = readingOwner('まよい');
        mockElementsFromPoint([target.anchor]);
        let measurable = true;
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(20, 400),
            measure: () => (measurable ? rect(20, 400) : null),
        }]);
        let layerTop = 0;
        const layer = document.querySelector<HTMLElement>('.jpdb-reader-detached-reading-document-layer')!;
        layer.getBoundingClientRect = () => rect(0, layerTop, 1200, 4000);
        await nextProjectionFrame();
        expect(projectedReading('まよい')?.style.top).toBe('400px');

        // The page scrolls 300px with the word still on it, and the pass that
        // lands mid-scroll cannot measure it.
        measurable = false;
        layerTop = -300;
        document.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        const reading = projectedReading('まよい');
        expect(reading?.style.display).toBe('block');
        expect(reading?.style.top).toBe('400px');
        clearProjectedReadings(target.owner);
    });

    // Grace bridges a burst of passes, not a quiet page: passes arrive on
    // events rather than on a clock, so a rect older than a quarter second is
    // stale enough that a missing measurement means the word is gone.
    it('refuses to bridge a measurement gap older than the grace window', async () => {
        const target = readingOwner('ふるび');
        mockElementsFromPoint([target.anchor]);
        let measurable = true;
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => (measurable ? rect() : null),
        }]);
        await nextProjectionFrame();
        expect(projectedReading('ふるび')?.style.display).toBe('block');

        measurable = false;
        const painted = Date.now();
        vi.spyOn(Date, 'now').mockImplementation(() => painted + 400);
        document.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        expect(projectedReading('ふるび')?.style.display).toBe('none');
        clearProjectedReadings(target.owner);
    });

    // A realm with no animation frames runs scheduled passes inline. The grace
    // follow-up is asked for from inside the pass that owes it, so scheduling
    // it inline re-entered the read/write cycle on its own stack and burned the
    // whole allowance before the event returned.
    it('does not re-enter the refresh pass in a realm without animation frames', async () => {
        const frames = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
        Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: undefined });
        try {
            const target = readingOwner('こだま');
            mockElementsFromPoint([target.anchor]);
            let measurable = true;
            let measured = 0;
            syncProjectedReadings(target.owner, [{
                source: target.source,
                anchor: target.anchor,
                rect: rect(),
                measure: () => {
                    measured += 1;
                    return measurable ? rect() : null;
                },
            }]);
            expect(projectedReading('こだま')?.style.display).toBe('block');

            measurable = false;
            measured = 0;
            document.dispatchEvent(new Event('scroll'));
            expect(measured).toBe(1);

            // The follow-ups still arrive, one turn at a time, and still retire
            // the stale clone without waiting for another event.
            for (let i = 0; i < 6; i++) await Promise.resolve();
            expect(projectedReading('こだま')?.style.display).toBe('none');
            clearProjectedReadings(target.owner);
        } finally {
            if (frames) Object.defineProperty(window, 'requestAnimationFrame', frames);
        }
    });
});

describe('detached reading scroll context', () => {
    type ProjectedTarget = ReturnType<typeof readingOwner> & { reading: HTMLElement };

    function makeScroller(overflow = 'auto'): HTMLElement {
        const scroller = document.createElement('div');
        // jsdom does not expand the overflow shorthand into longhands, so set
        // the axis the projection actually consults.
        scroller.style.overflowY = overflow;
        Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 100 });
        Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 400 });
        return scroller;
    }

    function projectTargetInto(host: HTMLElement | null, text: string): ProjectedTarget {
        const target = readingOwner(text);
        if (host) {
            if (!host.isConnected) document.body.append(host);
            host.append(target.anchor);
        }
        mockElementsFromPoint([target.anchor]);
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);
        return { ...target, reading: projectedReading(text)! };
    }

    function projectInto(host: HTMLElement | null, text: string): HTMLElement {
        return projectTargetInto(host, text).reading;
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

    it('anchors a reading inside an inner scroller on its native scroll layer', () => {
        const scroller = makeScroller();
        const reading = projectInto(scroller, 'なか');
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
        expect(reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(reading.parentElement?.classList.contains('jpdb-reader-detached-reading-scroll-layer'))
            .toBe(true);
        expect(reading.parentElement?.parentElement).toBe(scroller);
        expect(reading.style.getPropertyValue('position')).toBe('absolute');
    });

    it('shares one native layer until the last reading in a scroller clears', () => {
        const scroller = makeScroller();
        const first = projectTargetInto(scroller, 'ひとつ');
        const second = projectTargetInto(scroller, 'ふたつ');
        const layer = scroller.querySelector<HTMLElement>('.jpdb-reader-detached-reading-scroll-layer');

        expect(layer).not.toBeNull();
        expect(scroller.querySelectorAll('.jpdb-reader-detached-reading-scroll-layer')).toHaveLength(1);
        expect(first.reading.parentElement).toBe(layer);
        expect(second.reading.parentElement).toBe(layer);

        clearProjectedReadings(first.owner);
        expect(layer?.isConnected).toBe(true);
        expect(second.reading.parentElement).toBe(layer);

        clearProjectedReadings(second.owner);
        expect(layer?.isConnected).toBe(false);
        expect(scroller.querySelector('.jpdb-reader-detached-reading-scroll-layer')).toBeNull();
    });

    it('uses a layout-neutral flow layer without positioning a static scroller', () => {
        const scroller = makeScroller();
        const target = projectTargetInto(scroller, 'もちもの');

        expect(scroller.style.getPropertyValue('position')).toBe('');
        expect(target.reading.parentElement?.style.getPropertyValue('position')).toBe('relative');
        expect(target.reading.parentElement?.style.getPropertyValue('float')).toBe('left');

        clearProjectedReadings(target.owner);
        expect(scroller.style.getPropertyValue('position')).toBe('');
    });

    it('keeps the page content as the scroll panel tail while a flow layer is active', () => {
        const scroller = makeScroller();
        const content = document.createElement('div');
        scroller.append(content);
        document.body.append(scroller);
        const target = projectTargetInto(content, 'しっぽ');
        const layer = target.reading.parentElement;

        expect(layer?.classList.contains('jpdb-reader-detached-reading-scroll-layer')).toBe(true);
        expect(scroller.lastElementChild).toBe(content);
        expect(layer?.nextElementSibling).toBe(content);

        clearProjectedReadings(target.owner);
        expect(scroller.lastElementChild).toBe(content);
    });

    it('reattaches the same native layer when a panel renderer removes it', async () => {
        const scroller = makeScroller();
        let content = document.createElement('div');
        scroller.append(content);
        for (let depth = 0; depth < 5; depth += 1) {
            const child = document.createElement('div');
            content.append(child);
            content = child;
        }
        document.body.append(scroller);
        const target = projectTargetInto(content, 'もどる');
        const layer = target.reading.parentElement!;
        await nextProjectionFrame();

        layer.remove();
        expect(layer.isConnected).toBe(false);
        await nextProjectionFrame();

        expect(layer.parentElement).toBe(scroller);
        expect(scroller.querySelectorAll('.jpdb-reader-detached-reading-scroll-layer')).toHaveLength(1);
        expect(target.reading.parentElement).toBe(layer);
        clearProjectedReadings(target.owner);
    });

    it('moves the flow layer ahead when the page removes its unrelated tail', async () => {
        const scroller = makeScroller();
        const content = document.createElement('div');
        const tail = document.createElement('div');
        scroller.append(content, tail);
        document.body.append(scroller);
        const target = projectTargetInto(content, 'まもる');
        const layer = target.reading.parentElement!;

        expect(scroller.lastElementChild).toBe(tail);
        tail.remove();
        await nextProjectionFrame();

        expect(scroller.lastElementChild).toBe(content);
        expect(layer.nextElementSibling).toBe(content);
        clearProjectedReadings(target.owner);
    });

    it('does not overwrite a scroller position changed by the host while active', async () => {
        const scroller = makeScroller();
        const target = projectTargetInto(scroller, 'うわがき');
        expect(scroller.style.getPropertyValue('position')).toBe('');

        scroller.style.setProperty('position', 'absolute', 'important');
        expect(getComputedStyle(scroller).position).toBe('absolute');
        await nextProjectionFrame();
        clearProjectedReadings(target.owner);

        expect(scroller.style.getPropertyValue('position')).toBe('absolute');
        expect(scroller.style.getPropertyPriority('position')).toBe('important');
    });

    it('preserves a page-owned static position while using its own flow containing block', () => {
        const scroller = makeScroller();
        scroller.style.setProperty('position', 'static', 'important');
        const target = projectTargetInto(scroller, 'ゆずる');

        expect(target.reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(target.reading.parentElement?.style.getPropertyValue('position')).toBe('relative');
        expect(scroller.style.getPropertyValue('position')).toBe('static');
        expect(scroller.style.getPropertyPriority('position')).toBe('important');

        clearProjectedReadings(target.owner);
    });

    it.each(['flex', 'grid'])('does not add a flow item to a static %s scroller', display => {
        const scroller = makeScroller();
        scroller.style.display = display;
        scroller.style.gap = '12px';
        const target = projectTargetInto(scroller, `れいあうと${display}`);

        expect(target.reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(false);
        expect(target.reading.style.getPropertyValue('position')).toBe('fixed');
        expect(scroller.querySelector('.jpdb-reader-detached-reading-scroll-layer')).toBeNull();
        clearProjectedReadings(target.owner);
    });

    // YouTube's search shell advertises horizontal scrolling so its responsive
    // results can overflow at narrower widths, but on iPad the flex shell often
    // fits its contents exactly. Its overflow-y:hidden is clipping, not an
    // independent vertical scroll context. Stopping the ancestry walk here
    // strands the reading on the viewport layer while the document moves.
    it('keeps a reading in document space under a non-overflowing flex search shell', () => {
        const search = document.createElement('ytd-search');
        search.style.display = 'flex';
        search.style.overflowX = 'auto';
        search.style.overflowY = 'hidden';
        Object.defineProperties(search, {
            clientWidth: { configurable: true, value: 640 },
            scrollWidth: { configurable: true, value: 640 },
            clientHeight: { configurable: true, value: 900 },
            scrollHeight: { configurable: true, value: 900 },
        });

        const target = projectTargetInto(search, '検索');

        expect(target.reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(true);
        expect(target.reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(false);
        expect(target.reading.parentElement?.classList.contains('jpdb-reader-detached-reading-document-layer'))
            .toBe(true);
        expect(search.querySelector('.jpdb-reader-detached-reading-scroll-layer')).toBeNull();
        clearProjectedReadings(target.owner);
    });

    it('leaves a page-positioned scroller unchanged', () => {
        const scroller = makeScroller();
        scroller.style.setProperty('position', 'relative');
        const target = projectTargetInto(scroller, 'そのまま');

        expect(scroller.style.getPropertyValue('position')).toBe('relative');
        expect(scroller.style.getPropertyPriority('position')).toBe('');

        clearProjectedReadings(target.owner);
        expect(scroller.style.getPropertyValue('position')).toBe('relative');
        expect(scroller.style.getPropertyPriority('position')).toBe('');
    });

    it('reuses an existing positioned content host without changing its scroller', () => {
        const scroller = makeScroller();
        const content = document.createElement('div');
        content.style.position = 'absolute';
        scroller.append(content);
        document.body.append(scroller);
        const target = projectTargetInto(content, 'ないよう');

        expect(target.reading.parentElement?.classList.contains('jpdb-reader-detached-reading-scroll-layer'))
            .toBe(true);
        expect(target.reading.parentElement?.parentElement).toBe(content);
        expect(scroller.style.getPropertyValue('position')).toBe('');

        clearProjectedReadings(target.owner);
        expect(content.querySelector('.jpdb-reader-detached-reading-scroll-layer')).toBeNull();
        expect(scroller.style.getPropertyValue('position')).toBe('');
    });

    it('does not re-anchor a page-owned absolute descendant of a static scroller', () => {
        const scroller = makeScroller();
        const absolute = document.createElement('span');
        absolute.style.position = 'absolute';
        scroller.append(absolute);
        const target = projectTargetInto(scroller, 'あんぜん');

        expect(target.reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(target.reading.parentElement?.style.getPropertyValue('position')).toBe('relative');
        expect(scroller.style.getPropertyValue('position')).toBe('');
        expect(absolute.style.getPropertyValue('position')).toBe('absolute');

        clearProjectedReadings(target.owner);
    });

    it('does not re-anchor an absolute child added after the flow layer', async () => {
        const scroller = makeScroller();
        const target = projectTargetInto(scroller, 'あとから');
        expect(scroller.style.getPropertyValue('position')).toBe('');

        const absolute = document.createElement('span');
        absolute.style.position = 'absolute';
        scroller.append(absolute);
        await nextProjectionFrame();

        expect(target.reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(scroller.style.getPropertyValue('position')).toBe('');
        expect(absolute.style.getPropertyValue('position')).toBe('absolute');
        clearProjectedReadings(target.owner);
    });

    it('lets a later page class reposition the scroller while the flow layer is active', async () => {
        const style = document.createElement('style');
        style.textContent = '.page-fixed-panel { position: fixed !important; top: 7px; }';
        document.head.append(style);
        const scroller = makeScroller();
        const target = projectTargetInto(scroller, 'へんこう');
        expect(getComputedStyle(scroller).position).not.toBe('fixed');

        scroller.classList.add('page-fixed-panel');
        expect(getComputedStyle(scroller).position).toBe('fixed');
        await nextProjectionFrame();
        expect(target.reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(target.reading.parentElement?.style.getPropertyValue('position')).toBe('absolute');
        expect(target.reading.parentElement?.style.getPropertyValue('float')).toBe('none');

        clearProjectedReadings(target.owner);
        expect(getComputedStyle(scroller).position).toBe('fixed');
        style.remove();
    });

    // A line-clamped title or ellipsised byline is overflow:hidden with content
    // that overflows by design — the commonest annotated shape on a feed. It
    // clips, but it never scrolls, so it must still reach document space or the
    // reading drifts for the whole scrolled frame on every one of them.
    it('anchors a reading inside an unscrolled clipping box in document space', () => {
        const reading = projectInto(makeScroller('hidden'), 'きりとり');
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(true);
        expect(reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(false);
        expect(reading.parentElement?.classList.contains('jpdb-reader-detached-reading-document-layer'))
            .toBe(true);
    });

    it('reclassifies a clipping box on its first scripted scroll before the next paint', async () => {
        const scroller = makeScroller('hidden');
        const target = projectTargetInto(scroller, 'はじめて');
        expect(target.reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(true);

        scroller.scrollTop = 24;
        scroller.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        expect(target.reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
        expect(target.reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        clearProjectedReadings(target.owner);
    });

    // Once something has actually scrolled that box — only script can, on a
    // clipping box — its offset is real and document space would strand the
    // reading, so it needs the same native layer as an interactive scroller.
    it('anchors a reading inside a scrolled clipping box on its native scroll layer', () => {
        const scroller = makeScroller('hidden');
        Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 24 });
        const reading = projectInto(scroller, 'かくれ');
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
        expect(reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(reading.parentElement?.parentElement).toBe(scroller);
    });

    it.each(['fixed', 'sticky'])('keeps a reading under a %s ancestor on the viewport layer', position => {
        const pinned = document.createElement('div');
        pinned.style.position = position;
        const reading = projectInto(pinned, `ぴん${position}`);
        expect(reading.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
        expect(reading.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(false);
        expect(reading.parentElement?.classList.contains('jpdb-reader-detached-reading-overlay')).toBe(true);
        expect(reading.parentElement?.classList.contains('jpdb-reader-detached-reading-document-layer'))
            .toBe(false);
        expect(reading.parentElement?.classList.contains('jpdb-reader-detached-reading-scroll-layer'))
            .toBe(false);
        expect(reading.style.getPropertyValue('position')).toBe('fixed');
    });

    /**
     * Choosing the viewport layer is only half the contract: the clone's offsets
     * resolve against that layer's own box, so the layer has to actually BE
     * viewport space. Any ancestor establishing a containing block for fixed
     * descendants moves it — a `transform` or `will-change` on the root, which is
     * what sites hand iOS Safari for momentum scrolling — and parks it at the
     * document origin instead. Stamping as if the layer sat at (0, 0) then put
     * every reading over fixed content exactly the page's scroll offset above its
     * word, with no later pass able to recover it: the reported readings floating
     * in empty space over a cart dialog on a scrolled page. So the origin is
     * measured from the layer, exactly as the document and per-scroller layers
     * already were.
     */
    it('stamps a reading over fixed content through its layer, not an assumed viewport', async () => {
        const pinned = document.createElement('div');
        pinned.style.position = 'fixed';
        const target = projectTargetInto(pinned, 'かいもの');
        const layer = target.reading.parentElement!;
        expect(layer.classList.contains('jpdb-reader-detached-reading-document-layer')).toBe(false);
        expect(target.reading.style.top).toBe('20px');

        // The root captures the layer, so its box is the document's: 530px of
        // page scroll above the viewport.
        layer.getBoundingClientRect = () => rect(0, -530, 1200, 4000);
        document.dispatchEvent(new Event('scroll'));
        await nextProjectionFrame();

        // The word is fixed and has not moved on screen, so the stamp has to
        // grow by exactly what the layer lost.
        expect(target.reading.style.display).toBe('block');
        expect(target.reading.style.top).toBe('550px');
        clearProjectedReadings(target.owner);
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
        expect(projectedReading('いどう')?.classList.contains('jpdb-reader-projected-furi-scroll'))
            .toBe(true);
        clearProjectedReadings(target.owner);
    });

    it('re-decides the layer synchronously when the same source gets a new anchor', () => {
        const target = readingOwner('つけかえ');
        mockElementsFromPoint([target.anchor]);
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: target.anchor,
            rect: rect(),
            measure: () => rect(),
        }]);
        expect(projectedReading('つけかえ')?.classList.contains('jpdb-reader-projected-furi-document'))
            .toBe(true);

        const scroller = makeScroller();
        const replacement = document.createElement('div');
        replacement.append(target.owner);
        scroller.append(replacement);
        document.body.append(scroller);
        mockElementsFromPoint([replacement]);
        syncProjectedReadings(target.owner, [{
            source: target.source,
            anchor: replacement,
            rect: rect(),
            measure: () => rect(),
        }]);

        const reading = projectedReading('つけかえ');
        expect(reading?.classList.contains('jpdb-reader-projected-furi-document')).toBe(false);
        expect(reading?.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(reading?.parentElement?.parentElement).toBe(scroller);
        clearProjectedReadings(target.owner);
    });

    it('releases the old native layer when a reading moves between scrollers', async () => {
        const firstScroller = makeScroller();
        const secondScroller = makeScroller();
        document.body.append(firstScroller, secondScroller);
        const target = projectTargetInto(firstScroller, 'のりかえ');
        const firstLayer = target.reading.parentElement;

        expect(firstLayer?.classList.contains('jpdb-reader-detached-reading-scroll-layer')).toBe(true);
        expect(firstLayer?.parentElement).toBe(firstScroller);

        secondScroller.append(target.anchor);
        await nextProjectionFrame();

        const reading = projectedReading('のりかえ');
        const secondLayer = reading?.parentElement;
        expect(reading?.classList.contains('jpdb-reader-projected-furi-scroll')).toBe(true);
        expect(secondLayer?.classList.contains('jpdb-reader-detached-reading-scroll-layer')).toBe(true);
        expect(secondLayer?.parentElement).toBe(secondScroller);
        expect(firstLayer?.isConnected).toBe(false);
        expect(firstScroller.querySelector('.jpdb-reader-detached-reading-scroll-layer')).toBeNull();

        clearProjectedReadings(target.owner);
        expect(secondLayer?.isConnected).toBe(false);
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

    it('re-arms when the scheduler that owed a frame is replaced', () => {
        // The failure this pins: a frame armed against a scheduler that then goes
        // away can never run, so a latch keyed on "is a frame pending" stays set
        // and every later refresh is silently dropped for the life of the page.
        const view = document.defaultView!;
        const original = view.requestAnimationFrame;
        const install = (fn: (cb: FrameRequestCallback) => number): void => {
            Object.defineProperty(view, 'requestAnimationFrame', {
                configurable: true, writable: true, value: fn,
            });
        };
        const abandoned: FrameRequestCallback[] = [];
        const successor: FrameRequestCallback[] = [];
        try {
            // A scheduler that hands back a frame id and then never calls back.
            install(cb => { abandoned.push(cb); return 1; });
            const first = readingOwner('日本語');
            mockElementsFromPoint([first.source]);
            syncProjectedReadings(first.owner, [{
                source: first.source, anchor: first.anchor, rect: rect(), measure: () => rect(),
            }]);
            expect(abandoned.length).toBeGreaterThan(0);

            // The host swaps the scheduler out. The old frame is never coming.
            install(cb => { successor.push(cb); return 2; });
            const second = readingOwner('文字');
            mockElementsFromPoint([second.source]);
            syncProjectedReadings(second.owner, [{
                source: second.source, anchor: second.anchor, rect: rect(), measure: () => rect(),
            }]);
            expect(successor.length).toBeGreaterThan(0);

            clearProjectedReadings(first.owner);
            clearProjectedReadings(second.owner);
            first.anchor.remove();
            second.anchor.remove();
        } finally {
            install(original);
        }
    });

    it('calls requestAnimationFrame with its window as receiver', async () => {
        const view = document.defaultView!;
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
