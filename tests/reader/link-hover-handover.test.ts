import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderApp } from '../../src/reader/app/main';
import { handOverLinkHover } from '../../src/reader/app/link-hover-handover';
import { createReaderPopover } from '../../src/reader/popup/shell';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

// YQ-09: hovering 言語 on Wikipedia opened Wikipedia's page preview and Yomu's
// lookup together over the article. A hover lookup over a word inside a link
// now tells the page the pointer has moved on to Yomu's popup.

function linkedWord(): { link: HTMLAnchorElement; word: HTMLElement } {
    document.body.innerHTML = '<main><p>日本語は<a id="link" href="/wiki/言語" title="言語"><span id="word" class="jpdb-reader-word">言語</span></a>である。</p></main>';
    return {
        link: document.querySelector<HTMLAnchorElement>('#link')!,
        word: document.querySelector<HTMLElement>('#word')!,
    };
}

interface LeaveRecord { type: string; relatedTarget: EventTarget | null; title: string | null }

function recordLeaves(link: HTMLElement): LeaveRecord[] {
    const events: LeaveRecord[] = [];
    for (const type of ['mouseout', 'mouseleave', 'pointerout', 'pointerleave']) {
        link.addEventListener(type, event => events.push({ type, relatedTarget: (event as MouseEvent).relatedTarget, title: link.getAttribute('title') }));
    }
    return events;
}

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
});

describe('a hover lookup takes the hover from a link', () => {
    it('tells the link the pointer left it', () => {
        const { link, word } = linkedWord();
        const events = recordLeaves(link);
        // Delegated site handlers (jQuery) listen on the document.
        const delegated = vi.fn();
        document.addEventListener('mouseout', delegated);

        handOverLinkHover(word);

        expect(events.map(event => event.type)).toEqual(expect.arrayContaining(['mouseout', 'mouseleave']));
        expect(events.every(event => event.relatedTarget === link.parentElement)).toBe(true);
        expect(delegated).toHaveBeenCalledTimes(1);
        document.removeEventListener('mouseout', delegated);
    });

    // A hover menu that holds the link must stay open under the pointer. jQuery's
    // mouseleave and React's onMouseLeave both read a bubbling mouseout or
    // pointerout and close only when relatedTarget lies outside the menu.
    it('leaves a menu that holds the link open', () => {
        document.body.innerHTML = '<nav><ul id="menu"><li><a href="/製品"><span id="word">製品</span></a></li></ul></nav>';
        const menu = document.querySelector<HTMLElement>('#menu')!;
        const closed = vi.fn();
        for (const type of ['mouseout', 'pointerout']) {
            menu.addEventListener(type, event => {
                const to = (event as MouseEvent).relatedTarget;
                if (!(to instanceof Node && menu.contains(to))) closed(type);
            });
        }

        handOverLinkHover(document.querySelector<HTMLElement>('#word')!);

        expect(closed).not.toHaveBeenCalled();
    });

    it('leaves words outside links alone', () => {
        document.body.innerHTML = '<p><span id="word">言語</span></p>';
        const outside = vi.fn();
        document.addEventListener('mouseout', outside);

        handOverLinkHover(document.querySelector<HTMLElement>('#word')!);

        expect(outside).not.toHaveBeenCalled();
        document.removeEventListener('mouseout', outside);
    });

    it('fires when a hover popover mounts over a linked word, not for a click lookup', () => {
        vi.stubGlobal('ResizeObserver', class {
            observe(): void {}
            disconnect(): void {}
        });
        const settings = { ...DEFAULT_SETTINGS, popupMode: 'popover' as const, hoverPopupMode: 'popover' as const };
        const mount = (mode: 'hover' | 'modal'): LeaveRecord[] => {
            const app = new ReaderApp();
            const internals = app as unknown as {
                settings: typeof settings;
                mountPopover(popover: HTMLElement, anchor?: HTMLElement, options?: { mode?: 'modal' | 'hover' }): void;
            };
            internals.settings = settings;
            const { link, word } = linkedWord();
            const events = recordLeaves(link);
            try {
                internals.mountPopover(createReaderPopover('よむ', settings, mode), word, { mode });
            } finally {
                app.destroy();
            }
            return events;
        };

        const hover = mount('hover');
        expect(hover.some(event => event.type === 'mouseout')).toBe(true);
        // Wikipedia's page previews only handle leaves from a[href][title]: the
        // leave must reach the link before the title guard strips its title.
        expect(hover.find(event => event.type === 'mouseout')?.title).toBe('言語');
        expect(hover.every(event => (event.relatedTarget as Element | null)?.tagName === 'P')).toBe(true);
        expect(mount('modal')).toEqual([]);
    });
});
