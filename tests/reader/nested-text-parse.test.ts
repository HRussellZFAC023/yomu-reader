import { afterEach, describe, expect, it } from 'vitest';

import { canHoverLookupReaderWordElement, canLookupReaderWordElement } from '../../src/reader/app/dom-helpers';
import { collectFormControlTextTargetsIn, readerWordSurfaceText } from '../../src/reader/dom/index';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedTextParsePlan, providerExampleTextParsePlan } from '../../src/reader/lookup/nested-text-parse';
import { lookupPopoverParsedWordElement } from '../../src/reader/newtab/lookup-dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function renderParseableSection(text: string): HTMLElement {
    document.body.innerHTML = `<section><p class="jpdb-reader-parseable">${text}</p></section>`;
    return document.body.querySelector<HTMLElement>('section')!;
}

function expectNestedParseScheduled(root: HTMLElement, parseKey: string, scheduled: boolean): void {
    expect(nestedParseAlreadyScheduled(root, parseKey)).toBe(scheduled);
}

function appendParsedReaderWord(root: HTMLElement): void {
    const word = document.createElement('span');
    word.classList.add('jpdb-reader-word');
    root.querySelector<HTMLElement>('.jpdb-reader-parseable')!.append(word);
}

function clickParsedWordInPopover(popover: HTMLElement, target: HTMLElement): { click: MouseEvent; parsedWord: HTMLElement | null } {
    let parsedWord: HTMLElement | null = null;
    popover.addEventListener('click', event => {
        parsedWord = lookupPopoverParsedWordElement(event as MouseEvent, popover);
    });
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(click);
    return { click, parsedWord };
}

describe('nested text parse plans', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('collects parseable text targets and recognizes scheduled parse keys', () => {
        const root = renderParseableSection('今日はいい天気です。');

        const plan = nestedTextParsePlan(root, 24)!;

        expect(plan?.targets.map(target => target.text)).toEqual(['今日はいい天気です。']);
        expect(plan?.parseKey).toBe('今日はいい天気です。');
        expectNestedParseScheduled(root, plan.parseKey, false);
        root.dataset.jpdbReaderParseKey = plan.parseKey;
        expectNestedParseScheduled(root, plan.parseKey, true);
        appendParsedReaderWord(root);
        expectNestedParseScheduled(root, plan.parseKey, true);
    });

    it('does not mirror public text-entry placeholders as page lookup text', () => {
        const originalRect = HTMLElement.prototype.getBoundingClientRect;
        HTMLElement.prototype.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            width: 180,
            height: 32,
            top: 0,
            right: 180,
            bottom: 32,
            left: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <form>
                <input type="search" placeholder="質問してみましょう" aria-label="ChatGPT とチャットする">
                <textarea placeholder="今日はどうしますか" aria-label="メッセージ"></textarea>
                <select><option>日本語</option><option>英語</option></select>
            </form>
        `;

        try {
            const targets = collectFormControlTextTargetsIn(document.body, 10, true);

            expect(targets.map(target => target.text)).toEqual(['日本語 / 英語']);
        } finally {
            HTMLElement.prototype.getBoundingClientRect = originalRect;
        }
    });

    it('collects a parseable root element when parsing starts at the sentence', () => {
        document.body.innerHTML = '<span class="jpdb-reader-newtab-sentence jpdb-reader-parseable" lang="ja">お連れ様との会話が <mark class="jpdb-reader-example-target">日本語</mark>でしたので</span>';
        const root = document.body.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence');

        const plan = root ? nestedTextParsePlan(root, 24) : null;

        expect(plan?.targets.map(target => target.text)).toEqual(['お連れ様との会話が 日本語でしたので']);
    });

    it('applies parsed tokens inside a highlighted new-tab sentence', () => {
        document.body.innerHTML = '<h1 data-newtab-prompt style="text-align: center;"><span class="jpdb-reader-newtab-front"><span class="jpdb-reader-newtab-sentence jpdb-reader-parseable" lang="ja" data-newtab-sentence-render="true">お連れ様との会話が <mark class="jpdb-reader-example-target">日本語</mark>でしたので</span></span></h1>';
        const root = document.body.querySelector<HTMLElement>('[data-newtab-prompt]')!;
        const plan = nestedTextParsePlan(root, 24)!;

        applyNestedParsePlan(plan, [[
            token('お', 0),
            token('連れ', 1, 'つれ', 'heiban'),
            token('様', 3, 'さま', 'heiban'),
            token('と', 4),
            token('の', 5),
            token('会話', 6, 'かいわ', 'heiban'),
            token('が', 8),
            token('日本語', 10, 'にほんご', 'heiban'),
            token('で', 13),
            token('した', 14, 'した', 'heiban'),
            token('ので', 16, 'ので', 'heiban'),
        ]], { ...DEFAULT_SETTINGS, ankiEnabled: false });

        const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence mark .jpdb-reader-word');
        expect(word ? readerWordSurfaceText(word) : '').toBe('日本語');
        expect(word?.dataset.sentence).toBe('お連れ様との会話が 日本語でしたので');
        expect(word?.classList.contains('jpdb-reader-example-target')).toBe(false);
        expect(word?.closest('mark')?.classList.contains('jpdb-reader-example-target')).toBe(true);
    });

    it('skips stale nested parse targets when source text changes before apply', () => {
        document.body.innerHTML = '<section><p class="jpdb-reader-parseable">今日はいい天気です。</p></section>';
        const root = document.body.querySelector<HTMLElement>('section')!;
        const plan = nestedTextParsePlan(root, 24)!;
        const textNode = root.querySelector('p')?.firstChild as Text;

        textNode.data = '明日は雨です。';
        applyNestedParsePlan(plan, [[token('今日', 0, 'きょう', 'heiban')]], { ...DEFAULT_SETTINGS, ankiEnabled: false });

        expect(root.querySelector('.jpdb-reader-word')).toBeNull();
        expect(root.textContent).toBe('明日は雨です。');
    });

    it('replans partially parsed reader-owned example sentences as one stable sentence', () => {
        document.body.innerHTML = `
            <section data-jpdb-reader-root="true" data-jpdb-reader-parse-key="stale">
                <div class="jpdb-reader-example-sentence jpdb-reader-parseable">
                    <mark class="jpdb-reader-example-target"><span class="jpdb-reader-word jpdb-not-in-deck jpdb-pitch-heiban jpdb-reader-example-target" data-vid="1464530" data-sid="0" tabindex="-1">日本語</span></mark>は分かりません。
                </div>
            </section>
        `;
        const root = document.body.querySelector<HTMLElement>('section')!;
        const plan = nestedTextParsePlan(root, 24)!;

        expect(plan.targets.map(target => target.text)).toEqual(['日本語は分かりません。']);
        expect(root.dataset.jpdbReaderParseKey).toBeUndefined();

        applyNestedParsePlan(plan, [[
            token('日本語', 0, 'にほんご', 'heiban'),
            token('分かりません', 4, 'わかりません', 'heiban'),
        ]], { ...DEFAULT_SETTINGS, ankiEnabled: false });

        const sentence = root.querySelector<HTMLElement>('.jpdb-reader-example-sentence')!;
        const words = Array.from(sentence.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(readerWordSurfaceText(sentence).replace(/\s+/g, '')).toBe('日本語は分かりません。');
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['日本語', '分かりません']);
        expect(words[0]?.closest('mark')?.classList.contains('jpdb-reader-example-target')).toBe(true);

        root.dataset.jpdbReaderParseKey = plan.parseKey;
        expect(nestedTextParsePlan(root, 24)).toBeNull();
        expect(sentence.querySelectorAll('.jpdb-reader-word')).toHaveLength(2);
    });

    it('prioritizes a partially parsed provider sentence so every content word receives furigana', () => {
        document.body.innerHTML = '<section data-jpdb-reader-root="true"><div class="jpdb-reader-example-sentence jpdb-reader-parseable" data-provider-example-sentence data-yomu-furigana-mode="all">毎日<mark class="jpdb-reader-example-target"><span class="jpdb-reader-word jpdb-reader-example-target" data-vid="1" data-sid="0">復習</span></mark>する。</div></section>';
        const root = document.body.querySelector<HTMLElement>('section')!;
        const plan = providerExampleTextParsePlan(root, 24)!;

        expect(plan.targets.map(target => target.text)).toEqual(['毎日復習する。']);
        applyNestedParsePlan(plan, [[
            token('毎日', 0, 'まいにち', 'heiban'),
            token('復習', 2, 'ふくしゅう', 'heiban'),
        ]], { ...DEFAULT_SETTINGS, ankiEnabled: false });

        const sentence = root.querySelector<HTMLElement>('[data-provider-example-sentence]')!;
        expect(Array.from(sentence.querySelectorAll('rt')).map(rt => rt.textContent)).toEqual(['まいにち', 'ふくしゅう']);
        expect(sentence.querySelector('mark')?.textContent).toContain('復習');
    });

    it('puts provider sentences first without dropping the rest of the shared parse plan', () => {
        document.body.innerHTML = `
            <section>
                <div class="jpdb-reader-parseable">日本語を読む。</div>
                <div class="jpdb-reader-example-sentence jpdb-reader-parseable" data-provider-example-sentence>毎日復習する。</div>
            </section>
        `;
        const root = document.body.querySelector<HTMLElement>('section')!;

        expect(nestedTextParsePlan(root, 1)?.targets.map(target => target.text)).toEqual(['毎日復習する。']);
        expect(nestedTextParsePlan(root, 24)?.targets.map(target => target.text)).toEqual([
            '毎日復習する。',
            '日本語を読む。',
        ]);
        expect(nestedTextParsePlan(root, 24, { excludeProviderExamples: true })?.targets.map(target => target.text)).toEqual([
            '日本語を読む。',
        ]);
    });

    it('collects Japanese fragments from parseable grammar examples', () => {
        document.body.innerHTML = '<section><div class="jpdb-reader-grammar-example jpdb-reader-parseable"><div>窓が開けてあります。</div><div>The window has been opened and left that way.</div></div></section>';
        const root = document.body.querySelector<HTMLElement>('section');

        const plan = root ? nestedTextParsePlan(root, 24) : null;

        expect(plan?.targets.map(target => target.text)).toEqual(['窓が開けてあります。']);
    });

    it('parses monolingual glossary text without using dictionary image fallback labels as lookup text', () => {
        document.body.innerHTML = `
            <section>
                <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
                    <span>文字や文章を見て、その意味を理解する。</span>
                    <span class="gloss-image-link" data-dictionary="日日" data-path="media/read.png">
                        <span class="gloss-image-fallback">読書の絵</span>
                    </span>
                </div>
            </section>
        `;
        const root = document.body.querySelector<HTMLElement>('section')!;

        const plan = nestedTextParsePlan(root, 24);

        expect(plan?.targets.map(target => target.text)).toEqual(['文字や文章を見て、その意味を理解する。']);
    });

    it('collects lookup text from dictionary modal examples and found-in rows', () => {
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true">
                <details open>
                    <summary>Examples</summary>
                    <div class="jpdb-reader-example-sentence jpdb-reader-parseable">青空の下で本を読みます。</div>
                    <div class="jpdb-reader-study-match">
                        <span>Found in</span>
                        <span class="jpdb-reader-study-match-text jpdb-reader-parseable">読みます</span>
                    </div>
                </details>
            </div>
        `;
        const root = document.body.querySelector<HTMLElement>('.jpdb-reader-popover')!;
        const plan = nestedTextParsePlan(root, 24);

        expect(plan?.targets.map(target => target.text)).toEqual(['青空の下で本を読みます。', '読みます']);
    });

    it('renders ordinary popup dictionary prose as lookupable nested words', () => {
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true">
                <div class="jpdb-reader-local-glossary jpdb-reader-parseable">
                    <span>はさみを使う。</span>
                </div>
            </div>
        `;
        const popover = document.body.querySelector<HTMLElement>('.jpdb-reader-popover')!;
        const plan = nestedTextParsePlan(popover, 24)!;

        expect(plan.targets.map(target => target.text)).toEqual(['はさみを使う。']);
        applyNestedParsePlan(plan, [[
            token('はさみ', 0),
            token('使う', 4, 'つかう', 'heiban'),
        ]], { ...DEFAULT_SETTINGS, ankiEnabled: false, furiganaMode: 'all' });

        const words = Array.from(popover.querySelectorAll<HTMLElement>('.jpdb-reader-word'));
        expect(words.map(word => readerWordSurfaceText(word))).toEqual(['はさみ', '使う']);
        expect(words.map(word => word.dataset.jpdbReaderPassive ?? '')).toEqual(['', '']);
        expect(words.every(word => canLookupReaderWordElement(word))).toBe(true);
        expect(words[1]?.querySelector('rt')?.textContent).toBe('つか');
    });

    it('does not overlay textarea placeholders as lookupable content', () => {
        document.body.innerHTML = `
            <div class="Txyg0d SJXlhf">
                <textarea class="ITIRGe" placeholder="質問する" style="height:24px;font:16px/24px Arial,sans-serif"></textarea>
                <div aria-live="polite">Transcribing...</div>
            </div>
        `;
        const root = document.body.querySelector<HTMLElement>('.Txyg0d')!;
        const targets = collectFormControlTextTargetsIn(root, 24, false);
        const target = targets.find(candidate => candidate.text === '質問する');

        expect(target).toBeUndefined();

        const textarea = root.querySelector<HTMLTextAreaElement>('textarea')!;
        const mirror = textarea.nextElementSibling as HTMLElement | null;
        expect(mirror?.matches('.jpdb-reader-control-text-mirror')).not.toBe(true);
        expect(textarea.hasAttribute('data-jpdb-reader-control-placeholder-hidden')).toBe(false);
    });

    it('renders reader-owned action buttons as passive hoverable words without cancelling clicks', () => {
        document.body.innerHTML = `
            <section class="jpdb-reader-newtab" data-jpdb-reader-root="true">
                <button class="jpdb-reader-parseable" type="button" data-action="copy-newtab-url">新規タブURLをコピー</button>
            </section>
        `;
        const root = document.body.querySelector<HTMLElement>('.jpdb-reader-newtab')!;
        const button = root.querySelector<HTMLButtonElement>('button')!;
        let clicks = 0;
        button.addEventListener('click', () => {
            clicks += 1;
        });

        const plan = nestedTextParsePlan(root, 24)!;
        expect(plan.targets.map(target => target.text)).toEqual(['新規タブURLをコピー']);
        applyNestedParsePlan(plan, [[token('新規', 0, 'しんき', 'heiban')]], {
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            furiganaMode: 'all',
        });

        const word = button.querySelector<HTMLElement>('.jpdb-reader-word')!;
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        word.dispatchEvent(click);

        expect(readerWordSurfaceText(word)).toBe('新規');
        expect(word.dataset.jpdbReaderPassive).toBe('true');
        expect(word.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(word.querySelector('rt')?.textContent).toBe('しんき');
        expect(canHoverLookupReaderWordElement(word, true)).toBe(true);
        expect(click.defaultPrevented).toBe(false);
        expect(clicks).toBe(1);
    });

    it('clears stale parse markers before replacing parseable content', () => {
        document.body.innerHTML = '<section data-jpdb-reader-parse-key="今日はいい天気です。" data-jpdb-reader-parse-loading-key="今日はいい天気です。" data-jpdb-reader-parse-loading-id="1"><p class="jpdb-reader-parseable">今日はいい天気です。</p></section>';
        const root = document.body.querySelector<HTMLElement>('section')!;
        const plan = nestedTextParsePlan(root, 24)!;

        clearNestedParseState(root);

        expect(nestedParseAlreadyScheduled(root, plan.parseKey)).toBe(false);
        expect(root.dataset.jpdbReaderParseKey).toBeUndefined();
        expect(root.dataset.jpdbReaderParseLoadingKey).toBeUndefined();
        expect(root.dataset.jpdbReaderParseLoadingId).toBeUndefined();
    });

    it('keeps a newer parse loading marker when an older parse finishes late', () => {
        document.body.innerHTML = '<section data-jpdb-reader-parse-loading-key="今日はいい天気です。" data-jpdb-reader-parse-loading-id="newer"><p class="jpdb-reader-parseable">今日はいい天気です。</p></section>';
        const root = document.body.querySelector<HTMLElement>('section')!;

        clearNestedParseLoadingKey(root, '今日はいい天気です。', 'older');

        expect(root.dataset.jpdbReaderParseLoadingKey).toBe('今日はいい天気です。');
        expect(root.dataset.jpdbReaderParseLoadingId).toBe('newer');
    });
});

function token(surface: string, start: number, reading = surface, pitchClass = ''): JPDBToken {
    return {
        card: card(surface, reading),
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: reading === surface ? [] : [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass,
    };
}


function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1464530,
        sid: 0,
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}
