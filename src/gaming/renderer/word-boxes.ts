import type { YomuGamingSelectionRect } from '../ipc';
interface WordBox { text: string; box: YomuGamingSelectionRect }

/** Map a tokenizer span across provider words, interpolating only within a provider box. */
export function providerSpanBox(text: string, words: readonly WordBox[], start: number, end: number, vertical: boolean): YomuGamingSelectionRect | null {
    const boxes: YomuGamingSelectionRect[] = [];
    let cursor = 0;
    // Providers occasionally return horizontal words out of order.
    const ordered = vertical ? words : [...words].sort((a, b) => a.box.left - b.box.left);
    for (const word of ordered) {
        const index = text.indexOf(word.text, cursor);
        if (index < 0 || !word.text.length) continue;
        cursor = index + word.text.length;
        const from = Math.max(start, index), to = Math.min(end, cursor);
        if (from >= to) continue;
        const length = [...word.text].length;
        const a = [...word.text.slice(0, from - index)].length / length;
        const b = [...word.text.slice(from - index, to - index)].length / length;
        boxes.push(vertical
            ? { ...word.box, top: word.box.top + word.box.height * a, height: word.box.height * b }
            : { ...word.box, left: word.box.left + word.box.width * a, width: word.box.width * b });
    }
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map(box => box.left)), top = Math.min(...boxes.map(box => box.top));
    return { left, top, width: Math.max(...boxes.map(box => box.left + box.width)) - left,
        height: Math.max(...boxes.map(box => box.top + box.height)) - top };
}
