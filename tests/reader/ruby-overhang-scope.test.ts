import { afterEach, expect, it, vi } from 'vitest';
import { syncRubyEdgeOverhang } from '../../src/reader/dom/ruby-overhang';

const frames: FrameRequestCallback[] = [];
const originalRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
function flushFrames(): void { while (frames.length) frames.shift()!(0); }
function word(): string {
    return '<span class="jpdb-reader-word jpdb-reader-scan-word jpdb-reader-has-furi"><ruby class="jpdb-reader-ruby-overhang jpdb-reader-ruby-at-start jpdb-reader-ruby-at-end">間<rt>あいだ</rt></ruby></span>';
}

afterEach(() => {
    document.body.replaceChildren();
    window.dispatchEvent(new Event('resize'));
    flushFrames();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalRects) Object.defineProperty(Range.prototype, 'getClientRects', originalRects);
    else delete (Range.prototype as Partial<Range>).getClientRects;
});

it('remeasures only dirty paragraphs, including other readings they can reflow, and all roots on resize', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    const geometry = vi.fn(function (this: Range) {
        const parent = this.startContainer.parentElement;
        const wrapped = parent?.closest('[data-wrap="true"]') && parent.closest('[data-last-word]');
        return [wrapped ? new DOMRect(0, 30, 20, 20) : new DOMRect(100, 0, 20, 20)];
    });
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: geometry });
    document.body.innerHTML = Array.from({ length: 200 }, () => `<p>の${word()}で</p>`).join('');
    const words = [...document.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
    syncRubyEdgeOverhang(words);
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(800);

    geometry.mockClear();
    syncRubyEdgeOverhang([words[0]!]);
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(4);

    const paragraph = document.createElement('p');
    paragraph.innerHTML = `の${word()}で${word()}を`;
    document.body.append(paragraph);
    const neighbours = [...paragraph.querySelectorAll<HTMLElement>('.jpdb-reader-word')];
    neighbours[1]!.dataset.lastWord = 'true';
    syncRubyEdgeOverhang(neighbours);
    flushFrames();
    paragraph.dataset.wrap = 'true';
    geometry.mockClear();
    syncRubyEdgeOverhang([neighbours[0]!]);
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(8);
    expect(neighbours[1]!.querySelector('ruby')!.classList.contains('jpdb-reader-ruby-line-edge')).toBe(true);

    // Removed roots must not retain geometry work; a detached dirty root is also discarded.
    words[0]!.closest('p')!.remove();
    geometry.mockClear();
    syncRubyEdgeOverhang([words[0]!, words[1]!]);
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(4);
    geometry.mockClear();
    window.dispatchEvent(new Event('resize'));
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(804);

    // Moving a word can reflow both its old and new paragraph.
    words[5]!.closest('p')!.append(neighbours[0]!, document.createTextNode('を'));
    geometry.mockClear();
    syncRubyEdgeOverhang([neighbours[0]!]);
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(12);

    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `の${word()}で`;
    geometry.mockClear();
    syncRubyEdgeOverhang(shadow.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(4);
    host.remove();
    geometry.mockClear();
    syncRubyEdgeOverhang([words[1]!]);
    flushFrames();
    expect(geometry).toHaveBeenCalledTimes(4);
});
