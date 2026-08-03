import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    clearProjectedReadings,
    syncProjectedReadings,
} from '../../src/reader/dom/detached-reading-overlay-impl';

/**
 * A detached reading is painted over page-owned glyphs the reader may not
 * widen, so a reading longer than its base overhangs. Where the next word is
 * annotated too, the natural-width paint prints the two readings on top of each
 * other: asmr-200's title rendered かいらく over 快楽 and ちょうきょう over 調教
 * as one smeared かいらちょうきょう, and 繁體中文 lost all three of its readings
 * the same way.
 *
 * jsdom reports every client rect as zero, so the overlay falls back to
 * "full-width kana × font size" for a reading's natural width. Every reading
 * here therefore has a width these tests can compute exactly, which is what
 * makes the painted spans assertable without a layout engine.
 */
function rect(left: number, top: number, width: number, height = 20): DOMRect {
    return {
        left, top, width, height,
        right: left + width, bottom: top + height,
        x: left, y: top,
        toJSON: () => ({}),
    } as DOMRect;
}

interface PlacedReading {
    source: HTMLElement;
    kana: number;
    fontSize: number;
}

function lane(words: Array<{ reading: string; rect: DOMRect; fontSize?: number }>): {
    owner: HTMLElement;
    readings: PlacedReading[];
} {
    const anchor = document.createElement('div');
    anchor.getBoundingClientRect = () => rect(0, 0, 1000, 40);
    const owner = document.createElement('span');
    anchor.append(owner);
    document.body.append(anchor);
    const readings: PlacedReading[] = [];
    const projections = words.map(word => {
        const source = document.createElement('span');
        source.textContent = word.reading;
        const fontSize = word.fontSize ?? 10;
        source.style.fontSize = `${fontSize}px`;
        owner.append(source);
        readings.push({ source, kana: word.reading.length, fontSize });
        return { source, anchor, rect: word.rect, measure: () => word.rect };
    });
    syncProjectedReadings(owner, projections);
    return { owner, readings };
}

function clone(source: HTMLElement): HTMLElement {
    const text = source.textContent ?? '';
    const found = [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading="true"]')]
        .find(candidate => candidate.textContent === text);
    if (!found) throw new Error(`No projected reading for ${text}`);
    return found;
}

/**
 * Where the reading actually paints. `left` is the painted CENTRE (the clone
 * carries translate(-50%)), and any scaleX condense narrows it about that same
 * centre — so the span is derivable from the two written values alone.
 */
function paintedSpan(reading: PlacedReading): { left: number; right: number; scaleX: number } {
    const element = clone(reading.source);
    const centre = Number.parseFloat(element.style.left);
    const scaleX = Number.parseFloat(/scaleX\(([\d.]+)\)/u.exec(element.style.transform)?.[1] ?? '1');
    const width = reading.kana * reading.fontSize * scaleX;
    return { left: centre - width / 2, right: centre + width / 2, scaleX };
}

afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'elementsFromPoint');
    document.body.innerHTML = '';
});

describe('projected reading crowding', () => {
    // 快楽[かいらく] then 調教[ちょうきょう] at 20px, exactly as the owner's page
    // lays them out: six kana over a two-glyph base cannot fit, so the natural
    // paint runs back across the tail of かいらく.
    it('never prints one reading across another on the same line', () => {
        const { owner, readings } = lane([
            { reading: 'かいらく', rect: rect(100, 40, 40) },
            { reading: 'ちょうきょう', rect: rect(140, 40, 40) },
        ]);

        const [first, second] = readings.map(paintedSpan);
        expect(second.left).toBeGreaterThanOrEqual(first.right - 0.01);

        clearProjectedReadings(owner);
    });

    // The edge solver is allowed to move a long reading by more than a small
    // fixed pixel tolerance. Font metrics decide the exact amount; the stable
    // contract is that the shifted paint still covers the centre of its own
    // source and stays clear of the neighbouring annotation.
    it('keeps a strongly shifted edge reading anchored to its source', () => {
        const { owner, readings } = lane([
            { reading: 'かいらく', rect: rect(100, 40, 20) },
            { reading: 'あ', rect: rect(120, 40, 20) },
        ]);

        const [edge, neighbour] = readings.map(paintedSpan);
        const sourceCentre = 110;
        const paintedCentre = (edge.left + edge.right) / 2;
        expect(Math.abs(paintedCentre - sourceCentre)).toBeGreaterThan(4);
        expect(edge.left).toBeLessThanOrEqual(sourceCentre);
        expect(edge.right).toBeGreaterThanOrEqual(sourceCentre);
        expect(neighbour.left).toBeGreaterThanOrEqual(edge.right - 0.01);

        clearProjectedReadings(owner);
    });

    // 繁[しげ] 體[からだ] 中文[ちゅうぶん]: the middle reading is boxed in on both
    // sides, so there is nowhere to shift it to and it has to be condensed.
    it('condenses a reading boxed in by annotated neighbours on both sides', () => {
        const { owner, readings } = lane([
            { reading: 'しげ', rect: rect(100, 40, 14), fontSize: 6 },
            { reading: 'からだ', rect: rect(114, 40, 14), fontSize: 6 },
            { reading: 'ちゅうぶん', rect: rect(128, 40, 28), fontSize: 6 },
        ]);

        const [first, middle, last] = readings.map(paintedSpan);
        expect(middle.scaleX).toBeLessThan(1);
        // Condensed exactly into its own base, and still centred on it.
        expect(middle.right - middle.left).toBeLessThanOrEqual(14.01);
        expect((middle.left + middle.right) / 2).toBeCloseTo(121, 5);
        expect(middle.left).toBeGreaterThanOrEqual(first.right - 0.01);
        expect(last.left).toBeGreaterThanOrEqual(middle.right - 0.01);

        clearProjectedReadings(owner);
    });

    // Overhang is only limited by a NEIGHBOURING reading. A reading with room
    // beside it must keep its natural width and stay centred on its word, or
    // every isolated reading on the page moves for no reason.
    it('leaves a reading with room beside it exactly on its word', () => {
        const { owner, readings } = lane([
            { reading: 'ちょうきょう', rect: rect(100, 40, 40) },
            { reading: 'かいらく', rect: rect(400, 40, 40) },
        ]);

        const [wide, far] = readings.map(paintedSpan);
        expect(wide.scaleX).toBe(1);
        expect((wide.left + wide.right) / 2).toBeCloseTo(120, 5);
        expect(far.scaleX).toBe(1);
        expect((far.left + far.right) / 2).toBeCloseTo(420, 5);

        clearProjectedReadings(owner);
    });

    // Readings only crowd along one line. A word directly below another shares
    // its x range, and treating that as a collision would drag every wrapped
    // line's readings sideways.
    it('does not let a reading on the next line move this one', () => {
        const { owner, readings } = lane([
            { reading: 'ちょうきょう', rect: rect(100, 40, 40) },
            { reading: 'こうきょうか', rect: rect(100, 80, 40) },
        ]);

        for (const reading of readings.map(paintedSpan)) {
            expect(reading.scaleX).toBe(1);
            expect((reading.left + reading.right) / 2).toBeCloseTo(120, 5);
        }

        clearProjectedReadings(owner);
    });
});
