import { describe, expect, it, vi } from 'vitest';

import { makeRoomForRubyInCroppedRows } from '../../src/reader/dom';

function annotatedWord(furi = 'しんそつ', base = '新卒'): string {
    return `<span class="jpdb-reader-word jpdb-known"><ruby><span class="jpdb-reader-ruby-base">${base}</span><rp>(</rp><rt class="jpdb-reader-furi">${furi}</rt><rp>)</rp></ruby></span>`;
}

function mockOverflow(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
}

function mockRect(el: HTMLElement, rect: Pick<DOMRect, 'top' | 'bottom' | 'height'>): void {
    Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({
            width: 200,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
            left: 0,
            right: 200,
            x: 0,
            y: rect.top,
            toJSON: () => ({}),
        }),
        configurable: true,
    });
}

// The sweep is a GENERIC compact-row detector, not a per-site allowlist: any
// scanned site's tight non-prose row (fixed/max height or line-clamp) that
// carries a furigana word and crops it by a bounded amount grows to fit the
// reading. Curated YouTube/Google selectors remain only as a fast-path for rows
// whose crop is always ruby-caused; the metadata/comment/sidebar rows are now
// caught generically without enumeration. Prose (article/main) and tall
// collapsed "read more" regions are left at their authored size.
describe('makeRoomForRubyInCroppedRows', () => {
    it('grows a generic compact line-clamp row that crops its ruby', () => {
        document.body.innerHTML = `
            <div id="title" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:40px;line-height:20px">
                ${annotatedWord()}エンジニアの勉強
            </div>
        `;
        const titleBox = document.querySelector<HTMLElement>('#title')!;
        mockOverflow(titleBox, 56, 40);
        const adjusted = makeRoomForRubyInCroppedRows(document);

        // The compact clamp row grows to fit the reading (line-clamp lifts its
        // height cap so the "N lines" become N taller ruby lines).
        expect(adjusted).toBe(1);
        expect(titleBox.dataset.yomuRubyRoom).toBe('true');
        expect(titleBox.style.maxHeight).toBe('none');
        expect(titleBox.style.minHeight).toBe('56px');
        expect(document.querySelectorAll('#title rt')).toHaveLength(1);
        document.body.innerHTML = '';
    });

    it('grows a generic non-clamp compact clipped byline that crops its ruby', () => {
        document.body.innerHTML = `
            <div id="byline" style="overflow:hidden;max-height:22px">${annotatedWord()}チャンネル</div>
        `;
        const byline = document.querySelector<HTMLElement>('#byline')!;
        mockOverflow(byline, 34, 22);
        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(byline.dataset.yomuRubyRoom).toBe('true');
        expect(byline.style.maxHeight).toBe('34px');
        expect(document.querySelector('#byline rt')).not.toBeNull();
        // Idempotent: a second sweep with the same geometry makes no new change.
        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        document.body.innerHTML = '';
    });

    it('grows a generic fixed-height compact clipped row that crops its ruby', () => {
        document.body.innerHTML = `
            <div id="title" style="overflow:hidden;height:22px;line-height:22px">${annotatedWord()}の動画</div>
        `;
        const title = document.querySelector<HTMLElement>('#title')!;
        mockOverflow(title, 36, 22);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        // Definite height:22px is raised to the ruby height; max-height stays
        // unset (the box had no author max-height to lift).
        expect(title.style.height).toBe('36px');
        expect(title.dataset.yomuRubyRoom).toBe('true');
        expect(title.querySelector('rt')?.textContent).toBe('しんそつ');
        document.body.innerHTML = '';
    });

    it('re-raises a generic compact row when later ruby layout needs more height', () => {
        document.body.innerHTML = `
            <div id="title" style="overflow:hidden;height:22px;line-height:22px">${annotatedWord()}の動画</div>
        `;
        const title = document.querySelector<HTMLElement>('#title')!;
        mockOverflow(title, 34, 22);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(title.style.height).toBe('34px');
        expect(title.dataset.yomuRubyRoomHeight).toBe('34');

        // Content rewraps taller after the first grow; the sweep only ever grows.
        mockOverflow(title, 48, 34);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(title.style.height).toBe('48px');
        expect(title.dataset.yomuRubyRoomHeight).toBe('48');
        document.body.innerHTML = '';
    });

    it('refuses to size a tall generic block whose overflow exceeds the compact caps', () => {
        // A collapsed "read more"-style region is tall (past the short-row height
        // cap) and hides many lines (past the bounded-overflow cap): it must stay
        // collapsed even though it carries a furigana word.
        document.body.innerHTML = `
            <div id="readmore" style="overflow:hidden;height:120px;max-height:120px;line-height:20px">${annotatedWord()}の長い概要欄テキスト</div>
        `;
        const readmore = document.querySelector<HTMLElement>('#readmore')!;
        mockOverflow(readmore, 520, 120);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(readmore.style.height).toBe('120px');
        expect(readmore.dataset.yomuRubyRoom).toBeUndefined();
        expect(readmore.querySelector('rt')?.textContent).toBe('しんそつ');
        document.body.innerHTML = '';
    });

    it('grows the innermost generic clipped ancestor that crops its ruby', () => {
        document.body.innerHTML = `
            <a id="outer" style="display:block;overflow:hidden;height:42px;line-height:21px">
                <span id="inner" style="display:block;overflow:hidden;max-height:21px">
                    ${annotatedWord()}の長い動画タイトル
                </span>
            </a>
        `;
        const outer = document.querySelector<HTMLElement>('#outer')!;
        const inner = document.querySelector<HTMLElement>('#inner')!;
        mockOverflow(inner, 34, 21);
        mockOverflow(outer, 58, 42);

        // Both compact clipped ancestors crop the ruby and grow; furigana shows.
        expect(makeRoomForRubyInCroppedRows(document)).toBe(2);
        expect(inner.dataset.yomuRubyRoom).toBe('true');
        expect(outer.dataset.yomuRubyRoom).toBe('true');
        expect(outer.querySelector('rt')?.textContent).toBe('しんそつ');
        document.body.innerHTML = '';
    });

    it('grows generic boxes whose rendered ruby geometry is cropped by the box', () => {
        document.body.innerHTML = `
            <div id="title" style="overflow:hidden;height:42px;line-height:21px">${annotatedWord()}の短い動画</div>
        `;
        const title = document.querySelector<HTMLElement>('#title')!;
        const base = document.querySelector<HTMLElement>('.jpdb-reader-ruby-base')!;
        mockOverflow(title, 42, 42);
        mockRect(title, { top: 0, bottom: 42, height: 42 });
        mockRect(base, { top: 22, bottom: 44, height: 22 });

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(title.dataset.yomuRubyRoom).toBe('true');
        expect(title.style.minHeight).toBe('44px');
        expect(title.querySelector('rt')?.textContent).toBe('しんそつ');
        document.body.innerHTML = '';
    });

    it('reserves room on short generic rows whose ruby layout overflows the row height', () => {
        document.body.innerHTML = `
            <dl id="price-row" style="display:flex;align-items:flex-start;height:28px;line-height:28px;overflow:visible">
                <dt>${annotatedWord('かかく', '価格')}</dt>
                <dd>6,644円(${annotatedWord('ぜいこみ', '税込')})</dd>
            </dl>
        `;
        const row = document.querySelector<HTMLElement>('#price-row')!;
        mockOverflow(row, 79, 28);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(row.dataset.yomuRubyRoom).toBe('true');
        expect(row.style.minHeight).toBe('79px');
        expect(row.style.height).toBe('79px');
        expect(row.querySelector('rt')?.textContent).toBe('かかく');
        document.body.innerHTML = '';
    });

    it('leaves boxes alone when the ruby already fits', () => {
        document.body.innerHTML = `
            <div id="fits" style="display:-webkit-box;-webkit-line-clamp:4;overflow:hidden">${annotatedWord('べんきょう', '勉強')}します</div>
        `;
        const fits = document.querySelector<HTMLElement>('#fits')!;
        mockOverflow(fits, 80, 80);
        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(fits.style.maxHeight).toBe('');
        expect(document.querySelector('#fits rt')).not.toBeNull();
        document.body.innerHTML = '';
    });

    it('never reserves room inside a filter-collapsed card (sizing it would un-collapse the filter into a giant gap)', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 320, height: 40, top: 0, left: 0, right: 320, bottom: 40, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div class="jpdb-youtube-filter-collapsed" data-yomu-youtube-filtered="true" aria-hidden="true" style="overflow:hidden;height:40px">
                <div id="title" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:40px;line-height:20px">${annotatedWord()}エンジニアの勉強</div>
            </div>
        `;
        const collapsed = document.querySelector<HTMLElement>('.jpdb-youtube-filter-collapsed')!;
        const titleBox = document.querySelector<HTMLElement>('#title')!;
        // The collapsed card's full content height — exactly the value that
        // previously got written back as height:1055px, un-collapsing it.
        mockOverflow(collapsed, 1055, 40);
        mockOverflow(titleBox, 1055, 40);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(titleBox.dataset.yomuRubyRoom).toBeUndefined();
        expect(collapsed.dataset.yomuRubyRoom).toBeUndefined();
        expect(collapsed.style.height).toBe('40px');
        rectSpy.mockRestore();
        document.body.innerHTML = '';
    });

    it('refuses an implausibly large room (a mis-measured container, not a text row)', () => {
        document.body.innerHTML = `
            <div id="title" style="overflow:hidden;height:22px;line-height:22px">${annotatedWord()}の動画</div>
        `;
        const title = document.querySelector<HTMLElement>('#title')!;
        mockOverflow(title, 900, 22);
        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        // The cap leaves the box untouched: its inline height stays as authored.
        expect(title.style.height).toBe('22px');
        expect(title.dataset.yomuRubyRoom).toBeUndefined();
        document.body.innerHTML = '';
    });

    it('does not reserve ruby room on YouTube description expanders', () => {
        document.body.innerHTML = `
            <ytd-text-inline-expander id="description-inline-expander" style="overflow:hidden;height:104px;max-height:104px;line-height:20px">
                概要欄で${annotatedWord('にほんご', '日本語')}を勉強します。
            </ytd-text-inline-expander>
        `;
        const description = document.querySelector<HTMLElement>('#description-inline-expander')!;
        mockOverflow(description, 400, 104);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(description.style.height).toBe('104px');
        expect(description.style.maxHeight).toBe('104px');
        expect(description.dataset.yomuRubyRoom).toBeUndefined();
        expect(description.querySelector('rt')?.textContent).toBe('にほんご');
        document.body.innerHTML = '';
    });

    it('reserves ruby room on YouTube comment text so the base line does not disappear', () => {
        document.body.innerHTML = `
            <ytd-comment-view-model>
                <yt-attributed-string id="content-text" style="display:block;overflow:hidden;height:18px;max-height:18px;line-height:18px">
                    いい${annotatedWord('むすめ', '娘')}さんだなあ
                </yt-attributed-string>
            </ytd-comment-view-model>
        `;
        const comment = document.querySelector<HTMLElement>('#content-text')!;
        mockOverflow(comment, 36, 18);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(comment.style.height).toBe('36px');
        expect(comment.style.maxHeight).toBe('36px');
        expect(comment.dataset.yomuRubyRoom).toBe('true');
        expect(comment.querySelector('rt')?.textContent).toBe('むすめ');
        document.body.innerHTML = '';
    });

    it('reserves ruby room on YouTube attributed metadata mirrors', () => {
        document.body.innerHTML = `
            <div class="ytContentMetadataViewModelMetadataRow" style="overflow:hidden;height:22px;max-height:22px;line-height:22px">
                <span class="yt-core-attributed-string ytAttributedStringHost" style="visibility:hidden;position:relative">
                    1 日前
                    <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" style="visibility:visible">
                        1 ${annotatedWord('にち', '日')}前
                    </span>
                </span>
            </div>
        `;
        const row = document.querySelector<HTMLElement>('.ytContentMetadataViewModelMetadataRow')!;
        const host = document.querySelector<HTMLElement>('.ytAttributedStringHost')!;
        mockOverflow(row, 57, 22);
        mockOverflow(host, 57, 22);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(row.style.height).toBe('57px');
        expect(row.style.maxHeight).toBe('57px');
        expect(row.dataset.yomuRubyRoom).toBe('true');
        expect(host.dataset.yomuRubyRoom).toBeUndefined();
        expect(row.querySelector('rt')?.textContent).toBe('にち');
        document.body.innerHTML = '';
    });

    it('reserves room on compact YouTube lockup title rows without sizing the attributed host', () => {
        document.body.innerHTML = `
            <yt-lockup-view-model>
                <h3 id="title-row" class="ytLockupMetadataViewModelHeadingReset" style="overflow:hidden;height:22px;max-height:22px;line-height:22px">
                    <a href="/watch?v=jp">
                        <span class="yt-core-attributed-string ytAttributedStringHost" style="position:relative;visibility:hidden;overflow:hidden;height:22px;max-height:22px;line-height:22px">
                            革命道
                            <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" style="visibility:visible">
                                ${annotatedWord('かくめい', '革命')}道
                            </span>
                        </span>
                    </a>
                </h3>
            </yt-lockup-view-model>
        `;
        const row = document.querySelector<HTMLElement>('#title-row')!;
        const host = document.querySelector<HTMLElement>('.ytAttributedStringHost')!;
        mockOverflow(row, 42, 22);
        mockOverflow(host, 42, 22);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(row.style.height).toBe('42px');
        expect(row.style.maxHeight).toBe('42px');
        expect(host.dataset.yomuRubyRoom).toBeUndefined();
        expect(row.querySelector('rt')?.textContent).toBe('かくめい');
        document.body.innerHTML = '';
    });

    it('uses absolute text-mirror height to detect clipped YouTube title ruby', () => {
        document.body.innerHTML = `
            <yt-lockup-view-model>
                <h3 id="title-row" class="ytLockupMetadataViewModelHeadingReset" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:44px;line-height:22px">
                    <a href="/watch?v=jp">
                        <span class="yt-core-attributed-string ytAttributedStringHost" style="position:relative;visibility:hidden;overflow:visible">
                            巨大な石を運んだ理由
                            <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-jpdb-reader-has-ruby="true" style="visibility:visible">
                                ${annotatedWord('きょだい', '巨大')}な石を運んだ理由
                            </span>
                        </span>
                    </a>
                </h3>
            </yt-lockup-view-model>
        `;
        const row = document.querySelector<HTMLElement>('#title-row')!;
        const mirror = document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        mockOverflow(row, 44, 44);
        mockOverflow(mirror, 66, 44);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(row.style.maxHeight).toBe('none');
        expect(row.style.minHeight).toBe('66px');
        expect(row.dataset.yomuRubyRoomHeight).toBe('66');
        expect(mirror.closest<HTMLElement>('.ytAttributedStringHost')?.dataset.yomuRubyRoom).toBeUndefined();
        document.body.innerHTML = '';
    });

    it('adds settling room for large wrapped YouTube text mirrors', () => {
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <h1 id="watch-title" style="display:block;overflow:hidden;height:38px;max-height:38px;line-height:19px">
                    <span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true" data-jpdb-reader-has-ruby="true">
                        ${annotatedWord('かんぜんどくがく', '完全独学')}で${annotatedWord('えいご', '英語')}を${annotatedWord('べんきょう', '勉強')}する${annotatedWord('ほうほう', '方法')}
                    </span>
                </h1>
            </ytd-watch-metadata>
        `;
        const title = document.querySelector<HTMLElement>('#watch-title')!;
        const mirror = document.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        mockOverflow(title, 100, 38);
        mockOverflow(mirror, 100, 38);

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(title.style.height).toBe('108px');
        expect(title.style.maxHeight).toBe('108px');
        expect(title.dataset.yomuRubyRoomHeight).toBe('108');
        document.body.innerHTML = '';
    });

    it('reserves ruby room on clipped Google related-search buttons', () => {
        vi.stubGlobal('location', {
            href: 'https://www.google.com/search?q=test',
            origin: 'https://www.google.com',
            hostname: 'www.google.com',
            pathname: '/search',
        });
        try {
            document.body.innerHTML = `
                <div id="botstuff">
                    <button id="chip" style="overflow:hidden;height:22px;max-height:22px;line-height:22px">
                        Test ${annotatedWord('ふくすうけい', '複数形')}
                    </button>
                </div>
            `;
            const chip = document.querySelector<HTMLElement>('#chip')!;
            mockOverflow(chip, 38, 22);

            expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
            expect(chip.style.height).toBe('38px');
            expect(chip.style.maxHeight).toBe('38px');
            expect(chip.querySelector('rt')?.textContent).toBe('ふくすうけい');
        } finally {
            vi.unstubAllGlobals();
            document.body.innerHTML = '';
        }
    });

    it('reserves ruby room on nested Google result-local controls', () => {
        vi.stubGlobal('location', {
            href: 'https://www.google.com/search?q=test',
            origin: 'https://www.google.com',
            hostname: 'www.google.com',
            pathname: '/search',
        });
        try {
            document.body.innerHTML = `
                <div id="search">
                    <div class="MjjYud">
                        <div class="g">
                            <div id="chip" role="button" style="display:flex;align-items:center;overflow:hidden;height:36px;max-height:36px;line-height:18px;border-radius:18px">
                                <span id="label" style="display:block;overflow:hidden;height:18px;max-height:18px;line-height:18px">
                                    ${annotatedWord('けんさくけっか', '検索結果')}を表示
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            const chip = document.querySelector<HTMLElement>('#chip')!;
            const label = document.querySelector<HTMLElement>('#label')!;
            mockOverflow(label, 38, 18);
            mockOverflow(chip, 58, 36);

            expect(makeRoomForRubyInCroppedRows(document)).toBe(2);
            expect(label.style.height).toBe('38px');
            expect(label.style.maxHeight).toBe('38px');
            expect(chip.style.height).toBe('58px');
            expect(chip.style.maxHeight).toBe('58px');
            expect(chip.querySelector('.jpdb-reader-ruby-base')?.textContent).toBe('検索結果');
            expect(chip.querySelector('rt')?.textContent).toBe('けんさくけっか');
        } finally {
            vi.unstubAllGlobals();
            document.body.innerHTML = '';
        }
    });
});

// A single-line fixed row (chip/tab/action label) with the reading pinned at —
// or above — its top edge keeps the annotation shaved no matter how much the
// row grows downward: the missing clearance must become padding-top so the
// text is pushed down into the new room.
describe('makeRoomForRubyInCroppedRows top clearance', () => {
    it('pads a single-line clipped row whose reading pokes above the box top', () => {
        document.body.innerHTML = `
            <div id="tab" style="overflow:hidden;height:24px;line-height:24px">${annotatedWord()}順</div>
        `;
        const tab = document.querySelector<HTMLElement>('#tab')!;
        mockOverflow(tab, 24, 24);
        mockRect(tab, { top: 0, bottom: 24, height: 24 });
        mockRect(tab.querySelector<HTMLElement>('.jpdb-reader-ruby-base')!, { top: 8, bottom: 22, height: 14 });
        mockRect(tab.querySelector<HTMLElement>('rt')!, { top: -3, bottom: 5, height: 8 });

        expect(makeRoomForRubyInCroppedRows(document)).toBe(1);
        expect(tab.dataset.yomuRubyRoom).toBe('true');
        // 3px overflow + 1px clearance pushed down as padding, and the room
        // height accounts for the same 4px so the base line is not re-cropped.
        expect(tab.style.paddingTop).toBe('4px');
        expect(tab.dataset.yomuRubyRoomPadTop).toBe('4');
        expect(Number(tab.dataset.yomuRubyRoomHeight)).toBeGreaterThanOrEqual(28);
        document.body.innerHTML = '';
    });

    it('leaves single-line rows alone while the reading has real clearance', () => {
        document.body.innerHTML = `
            <div id="tab" style="overflow:hidden;height:28px;line-height:24px">${annotatedWord()}順</div>
        `;
        const tab = document.querySelector<HTMLElement>('#tab')!;
        mockOverflow(tab, 28, 28);
        mockRect(tab, { top: 0, bottom: 28, height: 28 });
        mockRect(tab.querySelector<HTMLElement>('.jpdb-reader-ruby-base')!, { top: 12, bottom: 26, height: 14 });
        mockRect(tab.querySelector<HTMLElement>('rt')!, { top: 3, bottom: 11, height: 8 });

        expect(makeRoomForRubyInCroppedRows(document)).toBe(0);
        expect(tab.style.paddingTop).toBe('');
        expect(tab.dataset.yomuRubyRoomPadTop).toBeUndefined();
        document.body.innerHTML = '';
    });
});
