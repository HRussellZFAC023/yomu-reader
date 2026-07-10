import { afterEach, describe, expect, it } from 'vitest';

import { makeRoomForRubyInCroppedRows, releaseRubyRoomGrowth, removeNonDestructiveScanMirrors } from '../../src/reader/dom';

function mockOverflow(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
}

afterEach(() => {
    document.body.innerHTML = '';
});

// Ruby-room growth lifecycle: growth writes are recorded and revertible.
describe('releaseRubyRoomGrowth', () => {
    function annotatedWord(furi = 'しんそつ', base = '新卒'): string {
        return `<span class="jpdb-reader-word jpdb-known"><ruby><span class="jpdb-reader-ruby-base">${base}</span><rt class="jpdb-reader-furi">${furi}</rt></ruby></span>`;
    }

    it('restores the recorded inline styles of a grown box', () => {
        document.body.innerHTML = `
            <div id="title" style="overflow:hidden;height:22px;line-height:22px">${annotatedWord()}の動画</div>
        `;
        const title = document.querySelector<HTMLElement>('#title')!;
        mockOverflow(title, 36, 22);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(title.style.height).toBe('36px');
        expect(title.dataset.yomuRubyRoom).toBe('true');

        expect(releaseRubyRoomGrowth(document)).toBe(1);
        expect(title.style.height).toBe('22px');
        expect(title.style.minHeight).toBe('');
        expect(title.style.maxHeight).toBe('');
        expect(title.dataset.yomuRubyRoom).toBeUndefined();
        expect(title.dataset.yomuRubyRoomHeight).toBeUndefined();
    });

    it('restores injected padding-top and the pad marker', () => {
        document.body.innerHTML = `
            <div id="tab" style="overflow:hidden;height:24px;line-height:24px">${annotatedWord()}順</div>
        `;
        const tab = document.querySelector<HTMLElement>('#tab')!;
        mockOverflow(tab, 24, 24);
        const rect = (element: HTMLElement, top: number, bottom: number, height: number) => Object.defineProperty(element, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ x: 0, y: top, left: 0, right: 200, top, bottom, width: 200, height, toJSON: () => ({}) }) as DOMRect,
        });
        rect(tab, 0, 24, 24);
        rect(tab.querySelector<HTMLElement>('.jpdb-reader-ruby-base')!, 8, 22, 14);
        rect(tab.querySelector<HTMLElement>('rt')!, -3, 5, 8);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(tab.style.paddingTop).toBe('4px');

        expect(releaseRubyRoomGrowth(document)).toBe(1);
        expect(tab.style.paddingTop).toBe('');
        expect(tab.dataset.yomuRubyRoomPadTop).toBeUndefined();
    });
});

// Mirror ownership: a box may only grow for a mirror its own annotated word
// renders in — never for an unrelated (taller) mirror it merely contains.
describe('ruby-room mirror ownership', () => {
    it('does not grow a compact row to an unowned taller mirror', () => {
        document.body.innerHTML = `
            <div id="row" style="overflow:hidden;height:60px;max-height:60px;line-height:20px">
                <span id="chip" class="jpdb-reader-word jpdb-known"><ruby><span class="jpdb-reader-ruby-base">新着</span><rt class="jpdb-reader-furi">しんちゃく</rt></ruby></span>
                <span id="other-host" style="position:relative;visibility:hidden">
                    チャンネル名がとても長い
                    <span id="other-mirror" class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-jpdb-reader-has-ruby="true" style="visibility:visible">
                        チャンネル名がとても長い
                    </span>
                </span>
            </div>
        `;
        const row = document.querySelector<HTMLElement>('#row')!;
        const otherMirror = document.querySelector<HTMLElement>('#other-mirror')!;
        // The row's own content fits; only the unrelated mirror is taller.
        mockOverflow(row, 60, 60);
        mockOverflow(otherMirror, 140, 60);

        makeRoomForRubyInCroppedRows(document);
        expect(row.style.minHeight).not.toBe('140px');
        expect(Number.parseInt(row.style.minHeight || '0', 10)).toBeLessThan(100);
    });
});

function grownTitle(): HTMLElement {
    document.body.innerHTML = `
        <div id="title" style="overflow:hidden;height:22px;line-height:22px"><span class="jpdb-reader-word jpdb-known"><ruby><span class="jpdb-reader-ruby-base">新卒</span><rt class="jpdb-reader-furi">しんそつ</rt></ruby></span>の動画</div>
    `;
    const title = document.querySelector<HTMLElement>('#title')!;
    mockOverflow(title, 36, 22);
    makeRoomForRubyInCroppedRows(document);
    return title;
}

describe('growth release vs framework restyles', () => {
    it('leaves a property alone when the framework re-styled it after our write', () => {
        const title = grownTitle();
        expect(title.style.height).toBe('36px');
        // Framework expands the row itself while annotations are active.
        title.style.setProperty('height', '60px');
        releaseRubyRoomGrowth(document);
        // The framework's newer value survives; untouched properties restore.
        expect(title.style.height).toBe('60px');
        expect(title.style.minHeight).toBe('');
        expect(title.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('releases growth on bulk mirror teardown (removeNonDestructiveScanMirrors)', () => {
        const title = grownTitle();
        expect(title.dataset.yomuRubyRoom).toBe('true');
        removeNonDestructiveScanMirrors(document);
        expect(title.dataset.yomuRubyRoom).toBeUndefined();
        expect(title.style.height).toBe('22px');
        expect(title.style.minHeight).toBe('');
    });
});

describe('foreign-mirror geometry cross-attribution', () => {
    it('ignores another host\'s mirror rubies when measuring top/bottom overflow', () => {
        document.body.innerHTML = `
            <div id="row" style="overflow:hidden;height:40px;max-height:40px;line-height:20px">
                <span id="chip" class="jpdb-reader-word jpdb-known"><ruby><span class="jpdb-reader-ruby-base">新着</span><rt class="jpdb-reader-furi">しんちゃく</rt></ruby></span>
                <span id="other-host" style="position:relative;visibility:hidden">
                    別のホスト
                    <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-jpdb-reader-has-ruby="true" style="visibility:visible">
                        <ruby><span id="foreign-base" class="jpdb-reader-ruby-base">別</span><rt id="foreign-rt" class="jpdb-reader-furi">べつ</rt></ruby>のホスト
                    </span>
                </span>
            </div>
        `;
        const row = document.querySelector<HTMLElement>('#row')!;
        mockOverflow(row, 40, 40);
        const rect = (element: HTMLElement, top: number, bottom: number) => Object.defineProperty(element, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ x: 0, y: top, left: 0, right: 200, top, bottom, width: 200, height: bottom - top, toJSON: () => ({}) }) as DOMRect,
        });
        rect(row, 0, 40);
        // The FOREIGN mirror's ruby base pokes far below the row bottom — under
        // document-order measurement this supplied a bottom deficit and grew
        // the shared ancestor. It must be ignored: only the chip's own rubies
        // (which fit) may measure this box when the chip's word triggers.
        rect(document.querySelector<HTMLElement>('#foreign-base')!, 30, 140);
        rect(document.querySelector<HTMLElement>('#foreign-rt')!, 20, 30);
        const chipRuby = document.querySelector<HTMLElement>('#chip .jpdb-reader-ruby-base')!;
        const chipRt = document.querySelector<HTMLElement>('#chip rt')!;
        rect(chipRuby, 14, 34);
        rect(chipRt, 5, 13);

        makeRoomForRubyInCroppedRows(document);
        expect(row.dataset.yomuRubyRoom).toBeUndefined();
        expect(row.style.minHeight).toBe('');
    });
});
