import { NativeTitleGuard } from '../../src/reader/app/native-title-guard';

describe('NativeTitleGuard', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('temporarily removes titles from the reader-owned anchor path and popover subtree', () => {
        document.body.innerHTML = `
            <div id="layer" data-jpdb-reader-root>
                <div id="line" title="OCR sentence">
                    <span id="word">実際</span>
                </div>
            </div>
            <div id="popover" title="Lookup">
                <button title="Play audio">Audio</button>
            </div>
        `;
        const guard = new NativeTitleGuard();
        const popover = document.querySelector<HTMLElement>('#popover')!;
        const anchor = document.querySelector<HTMLElement>('#word')!;
        const line = document.querySelector<HTMLElement>('#line')!;
        const button = popover.querySelector<HTMLButtonElement>('button')!;

        guard.suppressForPopover(popover, anchor);

        expect(line.hasAttribute('title')).toBe(false);
        expect(popover.hasAttribute('title')).toBe(false);
        expect(button.hasAttribute('title')).toBe(false);

        guard.restore();

        expect(line.title).toBe('OCR sentence');
        expect(popover.title).toBe('Lookup');
        expect(button.title).toBe('Play audio');
    });

    it('temporarily removes host-page title attributes from the active anchor path only', () => {
        document.body.innerHTML = `
            <h1 title="Native page title">
                <span id="word">実際</span>
            </h1>
            <aside id="unrelated" title="Unrelated native title">別の見出し</aside>
            <div id="popover" title="Lookup">
                <button title="Play audio">Audio</button>
            </div>
        `;
        const guard = new NativeTitleGuard();
        const popover = document.querySelector<HTMLElement>('#popover')!;
        const anchor = document.querySelector<HTMLElement>('#word')!;
        const title = document.querySelector<HTMLElement>('h1')!;
        const unrelated = document.querySelector<HTMLElement>('#unrelated')!;
        const button = popover.querySelector<HTMLButtonElement>('button')!;

        guard.suppressForPopover(popover, anchor);

        expect(title.hasAttribute('title')).toBe(false);
        expect(unrelated.title).toBe('Unrelated native title');
        expect(popover.hasAttribute('title')).toBe(false);
        expect(button.hasAttribute('title')).toBe(false);

        guard.restore();

        expect(title.title).toBe('Native page title');
        expect(unrelated.title).toBe('Unrelated native title');
        expect(popover.title).toBe('Lookup');
        expect(button.title).toBe('Play audio');
    });

    it('restores the latest title assigned while an element is suppressed', () => {
        document.body.innerHTML = '<span id="word" class="jpdb-reader-word" title="OCR sentence">実際</span><div id="popover"></div>';
        const guard = new NativeTitleGuard();
        const popover = document.querySelector<HTMLElement>('#popover')!;
        const anchor = document.querySelector<HTMLElement>('#word')!;

        guard.suppressForPopover(popover, anchor);
        anchor.title = 'Anki: due';
        guard.refresh(popover, anchor);
        guard.restore();

        expect(anchor.title).toBe('Anki: due');
    });

    it('refreshes titles added after the popover is mounted', () => {
        document.body.innerHTML = '<span id="word">実際</span><div id="popover"></div>';
        const guard = new NativeTitleGuard();
        const popover = document.querySelector<HTMLElement>('#popover')!;
        const anchor = document.querySelector<HTMLElement>('#word')!;
        const button = document.createElement('button');
        button.title = 'New action';
        popover.append(button);

        guard.suppressForPopover(popover, anchor);

        expect(button.hasAttribute('title')).toBe(false);
        guard.restore();
        expect(button.title).toBe('New action');
    });

    it('suppresses active-path titles added after the popover is mounted', async () => {
        document.body.innerHTML = '<h1 id="title"><span id="word">実際</span></h1><div id="popover"></div>';
        const guard = new NativeTitleGuard();
        const popover = document.querySelector<HTMLElement>('#popover')!;
        const anchor = document.querySelector<HTMLElement>('#word')!;
        const title = document.querySelector<HTMLElement>('#title')!;

        guard.suppressForPopover(popover, anchor);
        title.title = 'Late native title';
        await Promise.resolve();

        expect(title.hasAttribute('title')).toBe(false);
        guard.restore();
        expect(title.title).toBe('Late native title');
    });
});
