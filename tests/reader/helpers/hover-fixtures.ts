import { vi } from 'vitest';

function makeKeyboardNavigable(word: HTMLElement): void {
    Object.defineProperties(word, {
        getClientRects: {
            configurable: true,
            value: () => [new DOMRect(0, 0, 24, 24)],
        },
        scrollIntoView: {
            configurable: true,
            value: vi.fn(),
        },
    });
}

export function appendKeyboardLookupWords(words: Array<{
    vid: string;
    sid: string;
    sentence: string;
    text: string;
}>): HTMLElement[] {
    document.body.innerHTML = `
        <p>
            ${words.map(word => `<span class="jpdb-reader-word" data-vid="${word.vid}" data-sid="${word.sid}" data-sentence="${word.sentence}">${word.text}</span>`).join('\n')}
        </p>
    `;
    const elements = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
    elements.forEach(makeKeyboardNavigable);
    return elements;
}

export function appendSingleWordOcrLine(): { line: HTMLElement; word: HTMLElement } {
    const layer = document.createElement('div');
    layer.className = 'jpdb-ocr-layer';
    layer.dataset.jpdbReaderRoot = 'true';
    const line = document.createElement('div');
    line.className = 'jpdb-ocr-line';
    line.innerHTML = '<span class="jpdb-ocr-line-text"><span class="jpdb-reader-word" data-vid="1" data-sid="2" data-sentence="読む">読む</span></span>';
    layer.append(line);
    document.body.append(layer);
    return { line, word: line.querySelector<HTMLElement>('.jpdb-reader-word')! };
}

export function appendActivePopoverBody(text = '説明'): { popover: HTMLElement; body: HTMLElement } {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.innerHTML = `<div class="jpdb-reader-popover-body">${text}</div>`;
    document.body.append(popover);
    return { popover, body: popover.querySelector<HTMLElement>('.jpdb-reader-popover-body')! };
}

export function appendActivePopoverAndPageWord(): { popover: HTMLElement; pageWord: HTMLElement } {
    const popover = document.createElement('div');
    popover.className = 'jpdb-reader-popover';
    popover.dataset.jpdbReaderRoot = 'true';
    popover.textContent = '読む';
    const pageWord = parsedWordElement('3', '4', '本を読む', '読む');
    document.body.append(popover, pageWord);
    return { popover, pageWord };
}

export function appendParsedWordPair(): { firstWord: HTMLElement; nextWord: HTMLElement } {
    const firstWord = parsedWordElement('1', '2', '猫を見る', '猫');
    const nextWord = parsedWordElement('3', '4', '犬を見る', '犬');
    document.body.append(firstWord, nextWord);
    return { firstWord, nextWord };
}

function parsedWordElement(vid: string, sid: string, sentence: string, text: string): HTMLElement {
    const word = document.createElement('span');
    word.className = 'jpdb-reader-word';
    word.dataset.vid = vid;
    word.dataset.sid = sid;
    word.dataset.sentence = sentence;
    word.textContent = text;
    return word;
}
