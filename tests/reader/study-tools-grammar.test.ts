import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { detectGrammarHints, listLocalGrammarRuleExamples, renderGrammarHints } from '../../src/reader/study-tools';

const ENGLISH_WORD_RE = /\b[A-Za-z]{3,}\b/u;
const JA_GRAMMAR_RULE_COPY = fs.readFileSync(path.resolve('docs/public/data/ja-grammar-rule-copy.json'), 'utf8');

function detectedNames(sentence: string): string[] {
    return detectGrammarHints(sentence).map(hint => hint.name);
}

function textContent(html: string): string {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root.textContent ?? '';
}

describe('local Japanese grammar hints', () => {
    beforeAll(() => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JA_GRAMMAR_RULE_COPY, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }))));
    });

    it.each(listLocalGrammarRuleExamples())('detects $ruleId from its example', ({ ruleId, example }) => {
        const hints = detectGrammarHints(example.japanese);
        expect(hints.map(hint => hint.ruleId)).toContain(ruleId);
    });

    it('keeps specific clause grammar instead of letting long helper matches consume it', () => {
        const hints = detectGrammarHints('駅に着いたら電話してください。');
        expect(hints.map(hint => hint.name)).toContain('たら');
        expect(hints.map(hint => hint.name)).toContain('てください');
        expect(hints.find(hint => hint.name === 'てください')?.match).toBe('電話してください');
        expect(hints.map(hint => hint.name)).not.toContain('た');
    });

    it('detects common JLPT-style N4, N3, and N2 grammar', () => {
        expect(detectedNames('今日は来なくてもいいです。')).toContain('なくてもいい');
        expect(detectedNames('明日雨が降るかどうか分かりません。')).toContain('かどうか');
        const basis = detectGrammarHints('データに基づいて判断します。');
        expect(basis.map(hint => hint.name)).toContain('に基づいて');
        expect(basis.find(hint => hint.name === 'に基づいて')?.level).toBe('N3');
    });

    it('detects polite requests and advanced N1 grammar without hiding them behind particles', () => {
        expect(detectedNames('もう一度説明していただけませんか。')).toContain('ていただけませんか');
        expect(detectedNames('彼の言葉は人々を動かさずにはおかない。')).toContain('ずにはおかない');
        expect(detectedNames('雨が降ろうが降るまいが行きます。')).toContain('ようが / まいが');
        expect(detectedNames('心配するには及びません。')).toContain('には及ばない');
    });

    it('renders learner examples when a grammar point has one', async () => {
        const [hint] = detectGrammarHints('データに基づいて判断します。');
        const html = await renderGrammarHints([hint], 'データに基づいて判断します。', { knownRuleIds: [], showKnown: false });
        expect(html).toContain('Example');
        expect(html).toContain('jpdb-reader-grammar-example jpdb-reader-parseable');
        expect(html).toContain('データに基づいて判断します。');
        expect(html).toContain('based on data');
    });

    it('renders grammar rule cards in Japanese without English explanatory copy', async () => {
        const [hint] = detectGrammarHints('データに基づいて判断します。');
        const html = await renderGrammarHints([hint], 'データに基づいて判断します。', { knownRuleIds: [], showKnown: false }, 'ja');

        expect(html).toContain('根拠');
        expect(html).toContain('に基づく');
        expect(html).toContain('行動や判断の根拠や証拠');
        expect(html).toContain('詳細');
        expect(html).toContain('例');
        expect(html).toContain('データに基づいて判断します。');
        expect(html).not.toContain('文法項目');
        expect(html).not.toContain('Grammar point');
        expect(html).not.toContain('Details');
        expect(html).not.toContain('Example');
        expect(html).not.toContain('based on data');
    });

    it('uses the matched Japanese form for English-titled grammar rules in Japanese UI', async () => {
        const html = await renderGrammarHints([{
            ruleId: 'external-test',
            name: 'Verb ることができる (〜ru koto ga dekiru)',
            level: 'N4',
            kind: 'Imported grammar',
            short: 'Expresses ability or possibility.',
            detail: 'Used to say that someone can do an action.',
            url: '',
            match: 'ことができる',
            confidence: 'high',
            index: 5,
            examples: [],
        }], '日本語を読むことができる。', { knownRuleIds: [], showKnown: false }, 'ja');

        expect(html).toContain('>ことができる<');
        expect(html).not.toContain('Verb');
        expect(html).not.toContain('dekiru');
        expect(html).not.toContain('ability');
    });

    it.each(listLocalGrammarRuleExamples())('renders Japanese i18n copy for $ruleId without English words', async ({ ruleId, example }) => {
        const hint = detectGrammarHints(example.japanese).find(item => item.ruleId === ruleId);
        expect(hint).toBeTruthy();

        const html = await renderGrammarHints([hint!], example.japanese, { knownRuleIds: [], showKnown: false }, 'ja');
        expect(textContent(html)).not.toMatch(ENGLISH_WORD_RE);
    });
});
