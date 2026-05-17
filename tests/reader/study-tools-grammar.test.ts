import { describe, expect, it } from 'vitest';
import { detectGrammarHints, listLocalGrammarRuleExamples, renderGrammarHints } from '../../src/reader/study-tools';

function detectedNames(sentence: string): string[] {
    return detectGrammarHints(sentence).map(hint => hint.name);
}

describe('local Japanese grammar hints', () => {
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

    it('renders learner examples when a grammar point has one', () => {
        const [hint] = detectGrammarHints('データに基づいて判断します。');
        const html = renderGrammarHints([hint], 'データに基づいて判断します。', { knownRuleIds: [], showKnown: false });
        expect(html).toContain('Example');
        expect(html).toContain('jpdb-reader-grammar-example jpdb-reader-parseable');
        expect(html).toContain('データに基づいて判断します。');
        expect(html).toContain('based on data');
    });
});
