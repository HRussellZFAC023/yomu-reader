import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearProjectedReadingsWithin, projectedReadingWordAtPoint, syncProjectedReadings, withProjectedReadingBatch } from '../../src/reader/dom/detached-reading-overlay-impl';

function rect(left = 20): DOMRect {
    return { x: left, y: 40, left, top: 40, width: 30, height: 20, right: left + 30, bottom: 60, toJSON: () => ({}) } as DOMRect;
}
function owner(index: number) {
    const anchor = document.createElement('div');
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    const source = document.createElement('span');
    source.textContent = `よみ${index}`;
    source.style.fontSize = '10px';
    word.append(source); anchor.append(word); document.body.append(anchor);
    const bounds = rect(20 + index * 40);
    const read = vi.fn(() => bounds);
    anchor.getBoundingClientRect = read;
    return { anchor, word, source, read, projection: { source, anchor, rect: bounds, measure: vi.fn(() => bounds) } };
}
afterEach(() => {
    clearProjectedReadingsWithin(document);
    document.body.innerHTML = '';
    Reflect.deleteProperty(document, 'elementsFromPoint');
    vi.restoreAllMocks();
});
describe('projected reading scheduling', () => {
    it('coalesces standalone updates without painting or hit-testing partial frames', async () => {
        const owners = Array.from({ length: 30 }, (_, index) => owner(index));
        const hit = vi.fn(() => owners.map(item => item.anchor));
        Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: hit });
        owners.forEach(item => syncProjectedReadings(item.word, [item.projection]));
        const clones = [...document.querySelectorAll<HTMLElement>('[data-yomu-projected-reading]')];
        expect(clones).toHaveLength(30);
        expect(clones.every(clone => clone.style.visibility === 'hidden')).toBe(true);
        expect(hit).not.toHaveBeenCalled();
        clones[0].getBoundingClientRect = () => rect();
        expect(projectedReadingWordAtPoint(document, 30, 45)).toBeNull();
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(hit.mock.calls.length).toBeLessThanOrEqual(12 * 6);
        expect(hit.mock.calls.length).toBeGreaterThan(0);
        expect(owners.every(item => item.projection.measure.mock.calls.length <= 1)).toBe(true);
    });
    it('measures the live position when a source moves before its queued frame', async () => {
        const target = owner(0);
        let bounds = rect();
        target.anchor.getBoundingClientRect = () => bounds;
        target.projection.measure.mockImplementation(() => bounds);
        syncProjectedReadings(target.word, [target.projection]);
        bounds = rect(80);
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        expect(target.projection.measure).toHaveBeenCalledOnce();
        expect(document.querySelector<HTMLElement>('[data-yomu-projected-reading]')?.style.left).toBe('95px');
    });
    it.each([50, 100])('fits %i owners once at the outer batch boundary', count => {
        const owners = Array.from({ length: count }, (_, index) => owner(index));
        let connectivityReads = 0;
        owners.forEach(item => Object.defineProperty(item.word, 'isConnected', { configurable: true, get() { connectivityReads += 1; return true; } }));
        withProjectedReadingBatch(document, () => owners.forEach(item => {
            withProjectedReadingBatch(document, () => syncProjectedReadings(item.word, [item.projection]));
            expect(item.read).not.toHaveBeenCalled();
        }));
        expect(connectivityReads).toBeLessThanOrEqual(count * 4);
        expect(owners.every(item => item.read.mock.calls.length <= 1)).toBe(true);
        expect(owners.every(item => item.projection.measure.mock.calls.length === 0)).toBe(true);
    });
});
