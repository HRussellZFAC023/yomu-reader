import { afterEach, describe, expect, it } from 'vitest';

import { canHoverLookupReaderWordElement } from '../../src/reader/app/dom-helpers';
import { readerWordSurfaceText } from '../../src/reader/dom/index';
import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedSettingsTextParsePlan, nestedTextParsePlan } from '../../src/reader/lookup/nested-text-parse';
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

    it('renders dictionary popover summaries as passive render-only words', () => {
        document.body.innerHTML = `
            <div class="jpdb-reader-popover" data-jpdb-reader-root="true">
                <details open>
                    <summary class="jpdb-reader-local-title">翻訳</summary>
                    <div>Translation text.</div>
                </details>
            </div>
        `;
        const popover = document.body.querySelector<HTMLElement>('.jpdb-reader-popover')!;
        const details = popover.querySelector<HTMLDetailsElement>('details')!;
        const plan = nestedTextParsePlan(popover, 24)!;

        expect(plan.targets.map(target => target.text)).toEqual(['翻訳']);
        applyNestedParsePlan(plan, [[token('翻訳', 0, 'ほんやく', 'heiban')]], {
            ...DEFAULT_SETTINGS,
            ankiEnabled: false,
            furiganaMode: 'all',
        });

        const summaryWord = popover.querySelector<HTMLElement>('summary .jpdb-reader-word')!;
        let parsedWord: HTMLElement | null = null;
        popover.addEventListener('click', event => {
            parsedWord = lookupPopoverParsedWordElement(event as MouseEvent, popover);
        });
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        summaryWord.dispatchEvent(click);

        expect(readerWordSurfaceText(summaryWord)).toBe('翻訳');
        expect(summaryWord.dataset.jpdbReaderPassive).toBe('true');
        expect(summaryWord.classList.contains('jpdb-reader-passive-word')).toBe(true);
        expect(summaryWord.querySelector('rt')?.textContent).toBe('ほんやく');
        expect(parsedWord).toBeNull();
        expect(click.defaultPrevented).toBe(false);
        expect(details.open).toBe(false);
    });

    it('collects Japanese settings labels, headings, help prose, hidden panels, and select metadata without parsing status lines or unrelated hidden controls', () => {
        document.body.innerHTML = `
            <form class="jpdb-reader-settings" data-jpdb-reader-root="true">
                <h2>よむ 設定</h2>
                <span class="jpdb-reader-theme-title">テーマ</span>
                <div class="jpdb-reader-settings-tabs" role="tablist">
                    <button class="jpdb-reader-settings-tab" type="button" role="tab">外観</button>
                    <button class="jpdb-reader-settings-tab" type="button" role="tab">API</button>
                    <button class="jpdb-reader-settings-tab" type="button" role="tab">学習</button>
                </div>
                <div data-settings-panel="basics">
                    <fieldset><legend>基本</legend></fieldset>
                    <label>設定言語<select><option>日本語</option></select><div data-settings-select-options-meta>選択肢: 自動 / 日本語</div></label>
                    <div class="jpdb-reader-local-title">新規タブ</div>
                    <div class="jpdb-reader-help">日本語の説明を読む</div>
                    <div class="jpdb-reader-help" data-anki-setup-help>デスクトップAnkiの説明を読む</div>
                    <div class="jpdb-reader-status-line">JPDB APIキーがありません。公開検索は使えます。</div>
                </div>
                <div data-settings-panel="media" hidden>
                    <label>隠れた設定</label>
                    <div class="jpdb-reader-help">隠れた説明</div>
                </div>
                <div class="jpdb-reader-help" hidden>隠れた説明</div>
                <button type="button">保存</button>
                <a href="https://example.test">詳細</a>
            </form>
        `;
        const root = document.body.querySelector<HTMLElement>('form')!;

        const plan = nestedSettingsTextParsePlan(root, 24);
        const texts = plan?.targets.map(target => target.text) ?? [];

        expect(texts).toContain('日本語の説明を読む');
        expect(texts).not.toContain('デスクトップAnkiの説明を読む');
        expect(texts).not.toContain('JPDB APIキーがありません。公開検索は使えます。');
        expect(texts).toContain('よむ 設定');
        expect(texts).toContain('基本');
        expect(texts).toContain('設定言語');
        expect(texts).toContain('選択肢: 自動 / 日本語');
        expect(texts.filter(text => text === '選択肢: 自動 / 日本語')).toHaveLength(1);
        expect(texts).toContain('新規タブ');
        expect(texts).toContain('テーマ');
        expect(texts).toContain('外観');
        expect(texts).toContain('学習');
        expect(texts).not.toContain('日本語');
        expect(texts).not.toContain('API');
        expect(texts).toContain('隠れた設定');
        expect(texts).toContain('隠れた説明');
        expect(texts.filter(text => text === '隠れた説明')).toHaveLength(1);
        expect(texts).not.toContain('保存');
        expect(texts).not.toContain('詳細');
    });

    it('renders reader-owned settings chrome labels as passive parsed words', () => {
        document.body.innerHTML = `
            <form class="jpdb-reader-settings" data-jpdb-reader-root="true">
                <span class="jpdb-reader-theme-title">テーマ</span>
                <div class="jpdb-reader-settings-tabs" role="tablist">
                    <button class="jpdb-reader-settings-tab" type="button" role="tab">外観</button>
                    <button class="jpdb-reader-settings-tab" type="button" role="tab">API</button>
                    <button class="jpdb-reader-settings-tab" type="button" role="tab">学習</button>
                </div>
                <button type="button">保存</button>
            </form>
        `;
        const root = document.body.querySelector<HTMLElement>('form')!;

        const plan = nestedSettingsTextParsePlan(root, 24)!;
        expect(plan.targets.map(target => target.text)).toEqual(['テーマ', '外観', '学習']);

        applyNestedParsePlan(plan, plan.targets.map(target => {
            if (target.text === 'テーマ') return [token('テーマ', 0)];
            if (target.text === '外観') return [token('外観', 0, 'がいかん', 'heiban')];
            return [token('学習', 0, 'がくしゅう', 'heiban')];
        }), { ...DEFAULT_SETTINGS, furiganaMode: 'all', ankiEnabled: false });

        const themeWord = document.querySelector<HTMLElement>('.jpdb-reader-theme-title .jpdb-reader-word')!;
        const tabWord = document.querySelector<HTMLElement>('.jpdb-reader-settings-tab .jpdb-reader-word')!;
        expect(themeWord.classList.contains('jpdb-not-in-deck')).toBe(true);
        expect(tabWord.dataset.jpdbReaderPassive).toBe('true');
        expect(tabWord.querySelector('rt')?.textContent).toBe('がいかん');
        expect(document.querySelector('button[type="button"]:not(.jpdb-reader-settings-tab) .jpdb-reader-word')).toBeNull();
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
