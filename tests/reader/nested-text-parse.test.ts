import { afterEach, describe, expect, it } from 'vitest';

import { applyNestedParsePlan, clearNestedParseLoadingKey, clearNestedParseState, nestedParseAlreadyScheduled, nestedSettingsTextParsePlan, nestedTextParsePlan } from '../../src/reader/nested-text-parse';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/types';

describe('nested text parse plans', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('collects parseable text targets and recognizes scheduled parse keys', () => {
        document.body.innerHTML = '<section><p class="jpdb-reader-parseable">今日はいい天気です。</p></section>';
        const root = document.body.querySelector<HTMLElement>('section');

        const plan = root ? nestedTextParsePlan(root, 24) : null;

        expect(plan?.targets.map(target => target.text)).toEqual(['今日はいい天気です。']);
        expect(plan?.parseKey).toBe('今日はいい天気です。');
        expect(root && plan ? nestedParseAlreadyScheduled(root, plan.parseKey) : true).toBe(false);
        if (root && plan) root.dataset.jpdbReaderParseKey = plan.parseKey;
        expect(root && plan ? nestedParseAlreadyScheduled(root, plan.parseKey) : false).toBe(true);
        root?.querySelector('.jpdb-reader-parseable')?.append(document.createElement('span'));
        root?.querySelector('span')?.classList.add('jpdb-reader-word');
        expect(root && plan ? nestedParseAlreadyScheduled(root, plan.parseKey) : false).toBe(true);
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
        ]], DEFAULT_SETTINGS);

        const word = root.querySelector<HTMLElement>('.jpdb-reader-newtab-sentence mark .jpdb-reader-word');
        expect(word?.textContent).toBe('日本語');
        expect(word?.dataset.sentence).toBe('お連れ様との会話が 日本語でしたので');
        expect(word?.classList.contains('jpdb-reader-example-target')).toBe(false);
        expect(word?.closest('mark')?.classList.contains('jpdb-reader-example-target')).toBe(true);
    });

    it('collects Japanese fragments from parseable grammar examples', () => {
        document.body.innerHTML = '<section><div class="jpdb-reader-grammar-example jpdb-reader-parseable"><div>窓が開けてあります。</div><div>The window has been opened and left that way.</div></div></section>';
        const root = document.body.querySelector<HTMLElement>('section');

        const plan = root ? nestedTextParsePlan(root, 24) : null;

        expect(plan?.targets.map(target => target.text)).toEqual(['窓が開けてあります。']);
    });

    it('collects Japanese settings labels, headings, select metadata, and help prose without parsing hidden controls', () => {
        document.body.innerHTML = `
            <form class="jpdb-reader-settings" data-jpdb-reader-root="true">
                <h2>よむ 設定</h2>
                <div data-settings-panel="basics">
                    <fieldset><legend>基本</legend></fieldset>
                    <label>設定言語<select><option>日本語</option></select><div data-settings-select-options-meta>選択肢: 自動 / 日本語</div></label>
                    <div class="jpdb-reader-local-title">新規タブ</div>
                    <div class="jpdb-reader-help">日本語の説明を読む</div>
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
        expect(texts).toContain('よむ 設定');
        expect(texts).toContain('基本');
        expect(texts).toContain('設定言語');
        expect(texts).toContain('選択肢: 自動 / 日本語');
        expect(texts.filter(text => text === '選択肢: 自動 / 日本語')).toHaveLength(1);
        expect(texts).toContain('新規タブ');
        expect(texts).not.toContain('日本語');
        expect(texts).not.toContain('隠れた設定');
        expect(texts).not.toContain('隠れた説明');
        expect(texts).not.toContain('保存');
        expect(texts).not.toContain('詳細');
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
