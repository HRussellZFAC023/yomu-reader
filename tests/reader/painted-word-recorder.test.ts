import { afterEach, describe, expect, it } from 'vitest';
import { PaintedWordRecorder } from '../../src/reader/dom/painted-word-recorder';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('PaintedWordRecorder', () => {
    it('returns the words inserted under watched roots, whichever way they were inserted', () => {
        document.body.innerHTML = '<div id="root">本文<span class="jpdb-reader-word" id="old">古</span></div><div id="other"></div>';
        const root = document.getElementById('root')!;
        const recorder = new PaintedWordRecorder();
        recorder.watch(root);
        recorder.watch(root);

        // Destructive paint: a text node replaced by a fragment of word spans.
        const fragment = document.createDocumentFragment();
        fragment.append(word('a'), '・', word('b'));
        root.firstChild!.replaceWith(fragment);
        // A mirror inserted first and filled by HTML parsing afterwards.
        const mirror = document.createElement('span');
        root.append(mirror);
        mirror.innerHTML = '<span class="jpdb-reader-word" id="c"><ruby>本<rt>ほん</rt></ruby></span>';
        // Painted and torn down again within the same slice.
        const rebuilt = word('gone');
        root.append(rebuilt);
        rebuilt.remove();
        // Outside every watched root.
        document.getElementById('other')!.append(word('outside'));

        expect(recorder.take().map(added => added.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns an existing word whose own attributes change in place', () => {
        document.body.innerHTML = `<div id="root"><span class="jpdb-reader-word jpdb-not-in-deck" id="retained">本</span>
            <span class="jpdb-reader-word" id="untouched">犬</span></div>`;
        const root = document.getElementById('root')!;
        const recorder = new PaintedWordRecorder();
        recorder.watch(root);

        // A retained mirror word taking a new card status: its contrast and
        // index entry are stale unless it is handed over like a new word.
        const retained = document.getElementById('retained')!;
        retained.classList.replace('jpdb-not-in-deck', 'jpdb-learning');
        // Attribute writes on non-word elements touch no word.
        root.dataset.yomuDecoration = 'prose-full';

        expect(recorder.take().map(touched => touched.id)).toEqual(['retained']);
    });

    it('records nothing after take until a root is watched again', () => {
        document.body.innerHTML = '<div id="root"></div>';
        const root = document.getElementById('root')!;
        const recorder = new PaintedWordRecorder();
        recorder.watch(root);
        root.append(word('first'));
        expect(recorder.take().map(added => added.id)).toEqual(['first']);

        root.append(word('unwatched'));
        expect(recorder.take()).toEqual([]);

        recorder.watch(root);
        root.append(word('second'));
        expect(recorder.take().map(added => added.id)).toEqual(['second']);
    });
});

function word(id: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'jpdb-reader-word';
    span.id = id;
    span.textContent = id;
    return span;
}
