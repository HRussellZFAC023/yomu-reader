import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { nestedTextParsePlan } from '../../src/reader/lookup/nested-text-parse';
import { detectGrammarHints, listLocalGrammarRuleExamples, listLocalGrammarRules, renderGrammarHints, type GrammarHint } from '../../src/reader/study/tools';

const ENGLISH_WORD_RE = /\b[A-Za-z]{3,}\b/u;
const EN_GRAMMAR_RULE_COPY = fs.readFileSync(path.resolve('docs/public/data/en-grammar-rule-copy.json'), 'utf8');
const JA_GRAMMAR_RULE_COPY = fs.readFileSync(path.resolve('docs/public/data/ja-grammar-rule-copy.json'), 'utf8');

function detectedNames(sentence: string): string[] {
    return detectGrammarHints(sentence).map(hint => hint.name);
}

function detectedRuleIds(sentence: string): string[] {
    return detectGrammarHints(sentence).map(hint => hint.ruleId);
}

function textContent(html: string): string {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root.textContent ?? '';
}

function grammarHint(overrides: Partial<GrammarHint> & Pick<GrammarHint, 'ruleId' | 'name' | 'index' | 'match'>): GrammarHint {
    return {
        level: 'N5',
        kind: 'Particle',
        short: 'marks a sentence role',
        detail: 'Explains the particle role in context.',
        url: '',
        confidence: 'high',
        examples: [],
        ...overrides,
    };
}

describe('local Japanese grammar hints', () => {
    beforeAll(() => {
        vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input);
            const body = url.includes('/data/en-grammar-rule-copy.json') ? EN_GRAMMAR_RULE_COPY : JA_GRAMMAR_RULE_COPY;
            return Promise.resolve(new Response(body, {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            }));
        }));
    });

    it('loads Japanese grammar copy through the userscript request path when page fetch is blocked', async () => {
        const globalWithUserscript = globalThis as typeof globalThis & { GM_xmlhttpRequest?: UserscriptHttpRequest };
        const previousFetch = globalThis.fetch;
        const previousRequest = globalWithUserscript.GM_xmlhttpRequest;
        const fetchSpy = vi.fn(() => Promise.reject(new Error('CSP blocked fetch')));
        const requestSpy = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            details.onload?.({
                status: 200,
                response: undefined,
                responseText: JSON.stringify({
                    'particle-wa': {
                        kind: 'Particle',
                        short: 'marks the topic',
                        detail: 'Use は to mark the topic of the sentence.',
                    },
                }),
            });
            return { abort: vi.fn() };
        });

        vi.resetModules();
        vi.stubGlobal('fetch', fetchSpy);
        vi.stubGlobal('GM_xmlhttpRequest', requestSpy);

        try {
            const { grammarRuleText } = await import('../../src/reader/app/i18n');

            await expect(grammarRuleText('ja', 'particle-wa')).resolves.toMatchObject({
                short: 'marks the topic',
            });
            expect(requestSpy).toHaveBeenCalledWith(expect.objectContaining({
                method: 'GET',
                responseType: 'json',
                url: expect.stringContaining('/data/ja-grammar-rule-copy.json'),
            }));
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            vi.stubGlobal('fetch', previousFetch);
            vi.stubGlobal('GM_xmlhttpRequest', previousRequest);
            vi.resetModules();
        }
    });

    it('has explicit unit-test example coverage for every local grammar rule', () => {
        const rules = listLocalGrammarRules();
        const examples = listLocalGrammarRuleExamples();
        const ruleIdCounts = new Map<string, number>();
        const exampleRuleIds = new Set(examples.map(example => example.ruleId));
        for (const rule of rules) ruleIdCounts.set(rule.ruleId, (ruleIdCounts.get(rule.ruleId) ?? 0) + 1);

        const duplicateRuleIds = Array.from(ruleIdCounts)
            .filter(([, count]) => count > 1)
            .map(([ruleId]) => ruleId);
        const missingExampleRuleIds = rules
            .filter(rule => rule.exampleCount === 0 || !exampleRuleIds.has(rule.ruleId))
            .map(rule => rule.ruleId);

        expect(duplicateRuleIds).toEqual([]);
        expect(missingExampleRuleIds).toEqual([]);
        expect(examples.length).toBeGreaterThanOrEqual(rules.length);
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

    it('detects suru and related high-frequency grammar without hiding specific helpers', () => {
        const suruHints = detectGrammarHints('質問する答えを探す。');
        expect(suruHints.map(hint => hint.ruleId)).toContain('verb-suru');

        const progressiveHints = detectGrammarHints('毎日勉強しています。');
        expect(progressiveHints.map(hint => hint.ruleId)).toContain('aspect-te-iru');

        expect(detectedNames('飲み物はお茶にします。')).toContain('にする');
        expect(detectedNames('部屋を明るくしました。')).toContain('くする');
        expect(detectedNames('今日は休みでした。')).toContain('です / だ');
        expect(detectedNames('これは私の本じゃない。')).toContain('ではない / じゃない');
    });

    it('keeps broad new grammar rules from overtaking safer particle and time readings', () => {
        expect(detectGrammarHints('友だちと話します。').map(hint => hint.ruleId)).toContain('particle-to');
        expect(detectGrammarHints('友だちと話します。').map(hint => hint.ruleId)).not.toContain('conditional-to');
        expect(detectGrammarHints('三時に会います。').map(hint => hint.ruleId)).toContain('particle-ni');
        expect(detectGrammarHints('三時に会います。').map(hint => hint.ruleId)).not.toContain('time-toki');
        expect(detectGrammarHints('高ければ良いというものではない。').map(hint => hint.ruleId)).not.toContain('reason-node');
    });

    it('detects negative and past-negative helper verb variants', () => {
        expect(detectGrammarHints('まだ確認してみなかった。').map(hint => hint.ruleId)).toContain('attempt-te-miru');
        expect(detectGrammarHints('資料を準備しておかなかった。').map(hint => hint.ruleId)).toContain('preparation-te-oku');
        expect(detectGrammarHints('財布を忘れてしまわなかった。').map(hint => hint.ruleId)).toContain('completion-te-shimau');
        expect(detectGrammarHints('友だちは手伝ってくれなかった。').map(hint => hint.ruleId)).toContain('benefactive-te-kureru-morau');
        expect(detectGrammarHints('先生に教えてもらえませんか。').map(hint => hint.ruleId)).toContain('benefactive-te-kureru-morau');
        expect(detectGrammarHints('雨が降ってこない。').map(hint => hint.ruleId)).toContain('aspect-te-kuru');
        expect(detectGrammarHints('これから増えていかない。').map(hint => hint.ruleId)).toContain('aspect-te-iku');
        expect(detectGrammarHints('予定は書いてありません。').map(hint => hint.ruleId)).toContain('aspect-te-aru');
    });

    it('detects voice and suru-family negative variants', () => {
        expect(detectGrammarHints('先生に褒められた。').map(hint => hint.ruleId)).toContain('voice-passive-potential');
        expect(detectGrammarHints('部下に確認させない。').map(hint => hint.ruleId)).toContain('voice-causative');
        expect(detectGrammarHints('子どもは野菜を食べさせられなかった。').map(hint => hint.ruleId)).toContain('voice-causative-passive');
        expect(detectGrammarHints('野菜を食べようとしない。').map(hint => hint.ruleId)).toContain('attempt-you-to-suru');
        expect(detectGrammarHints('毎日運動するようにしていない。').map(hint => hint.ruleId)).toContain('habit-you-ni-suru');
        expect(detectGrammarHints('今日は外出しないことにした。').map(hint => hint.ruleId)).toContain('decision-koto-ni-suru');
    });

    it('separates appearance そう from hearsay そうだ and expands らしい / みたい inflections', () => {
        const appearanceHints = detectGrammarHints('このケーキはおいしそうです。');
        expect(appearanceHints.map(hint => hint.ruleId)).toContain('appearance-sou');
        expect(appearanceHints.map(hint => hint.ruleId)).not.toContain('hearsay-sou-da');

        const hearsayHints = detectGrammarHints('ニュースによると、雪が降るそうです。');
        expect(hearsayHints.map(hint => hint.ruleId)).toContain('hearsay-sou-da');

        expect(detectedRuleIds('学生みたい。')).toContain('evidence-rashii-mitai');
        expect(detectedRuleIds('学生みたいでした。')).toContain('evidence-rashii-mitai');
        expect(detectedRuleIds('学生らしかった。')).toContain('evidence-rashii-mitai');
        expect(detectedRuleIds('学生らしく話す。')).toContain('evidence-rashii-mitai');
        expect(detectedRuleIds('毎日読んでいるので、もっと読みたい。')).not.toContain('evidence-rashii-mitai');
        expect(detectedRuleIds('夏休みたいな時間がほしい。')).not.toContain('evidence-rashii-mitai');
    });

    it('detects remaining high-frequency inflection variants', () => {
        expect(detectedRuleIds('一人で勉強できます。')).toContain('potential-dekiru');
        expect(detectedRuleIds('高くならない。')).toContain('change-ku-naru-ni-naru');
        expect(detectedRuleIds('便利になっています。')).toContain('change-ku-naru-ni-naru');
        expect(detectedRuleIds('医者となった。')).toContain('change-ku-naru-ni-naru');
        expect(detectedRuleIds('料理を作りすぎて、余りました。')).toContain('excess-sugiru');
        expect(detectedRuleIds('運動するようになっていません。')).toContain('change-you-ni-naru');
        expect(detectedRuleIds('もう来てほしくありません。')).toContain('desire-other-te-hoshii');
        expect(detectedRuleIds('今日は外食にしませんでした。')).toContain('choice-ni-suru');
        expect(detectedRuleIds('音を大きくしませんでした。')).toContain('change-ku-suru');
        expect(detectedRuleIds('彼は来ると思いませんでした。')).toContain('quotation-to-omou');
        expect(detectedRuleIds('部屋に猫がいませんでした。')).toContain('existence-ga-aru-iru');
        expect(detectedRuleIds('今日は変な音がしません。')).toContain('sensation-ga-suru');
        expect(detectedRuleIds('それは正しいと言われていません。')).toContain('hearsay-to-iwarete-iru');
        expect(detectedRuleIds('今回は中止することになりませんでした。')).toContain('arrangement-koto-ni-naru');
        expect(detectedRuleIds('変更はございませんでした。')).toContain('polite-gozaimasu');
        expect(detectedRuleIds('最近、日本語を読み続けていません。')).toContain('phase-compound-verb');
        expect(detectedRuleIds('その事故は起こり得なかった。')).toContain('possibility-eru-enai');
        expect(detectedRuleIds('その依頼は受けかねました。')).toContain('difficulty-kaneru');
    });

    it('detects additional common grammar gaps from source-backed audits', () => {
        expect(detectedRuleIds('ここに座っても大丈夫です。')).toContain('permission-temo-ii');
        expect(detectedRuleIds('辞書を使ってもかまいません。')).toContain('permission-temo-ii');
        expect(detectedRuleIds('ここで写真を撮ってはならない。')).toContain('prohibition-tewa-ikenai');
        expect(detectedRuleIds('日本に来たばかりです。')).toContain('recent-ta-bakari');
        expect(detectedRuleIds('映画を見に行きます。')).toContain('purpose-masu-stem-ni-iku');
        expect(detectedRuleIds('泳ぐのは楽しいです。')).toContain('nominalizer-no');
        expect(detectedRuleIds('台風による被害が広がった。')).toContain('relation-ni-yotte');
        expect(detectedRuleIds('政府に対する批判が高まっている。')).toContain('target-ni-taishite');
        expect(detectedRuleIds('安いからといって、買うとは限らない。')).toContain('qualification-kara-to-itte');
        expect(detectedRuleIds('雨が降らない限り、試合は行われます。')).toContain('condition-nai-kagiri');
        expect(detectedRuleIds('行くにしても、早めに連絡してください。')).toContain('concession-ni-shitemo-toshitemo');
        expect(detectedRuleIds('賛成にせよ反対にせよ、理由を説明してください。')).toContain('concession-ni-shiro-ni-seyo');
        expect(detectedRuleIds('長く迷ったあげく、買わないことにした。')).toContain('after-all-ageku');
        expect(detectedRuleIds('何度も話し合った末に、計画を変更した。')).toContain('after-effort-sue-ni');
    });

    it('avoids known lexical and unpaired false positives in broad grammar rules', () => {
        const snugHints = detectGrammarHints('この服はぴったりです。').map(hint => hint.ruleId);
        expect(snugHints).not.toContain('list-tari');

        const regretHints = detectGrammarHints('残念ながら行けません。').map(hint => hint.ruleId);
        expect(regretHints).not.toContain('simultaneous-nagara');

        const saidHints = detectGrammarHints('彼は行くといった。').map(hint => hint.ruleId);
        expect(saidHints).not.toContain('example-to-itta');

        const wishHints = detectGrammarHints('雨が降るといいですね。').map(hint => hint.ruleId);
        expect(wishHints).not.toContain('pair-to-ii-to-ii');

        expect(detectGrammarHints('デザインといい性能といい素晴らしい。').map(hint => hint.ruleId)).toContain('pair-to-ii-to-ii');
    });

    it('avoids lexical false positives for short suffix-like grammar rules', () => {
        expect(detectedRuleIds('そうです。')).not.toContain('appearance-sou');
        expect(detectedRuleIds('さようなら。')).not.toContain('volitional-you');
        expect(detectedRuleIds('さようなら。')).not.toContain('similarity-you-da');
        expect(detectedRuleIds('さようなら。')).not.toContain('conditional-nara');
        expect(detectedRuleIds('いたいです。')).not.toContain('desire-tai');
        expect(detectedRuleIds('冷たい水です。')).not.toContain('desire-tai');
        expect(detectedRuleIds('重たい荷物です。')).not.toContain('desire-tai');
        expect(detectedRuleIds('少ないですね。')).not.toContain('negative-nai');
        expect(detectedRuleIds('少ないです。')).not.toContain('without-naide');
        expect(detectedRuleIds('危ないです。')).not.toContain('without-naide');
        expect(detectedRuleIds('まかないを食べる。')).not.toContain('negative-nai');
        expect(detectedRuleIds('何気ない態度です。')).not.toContain('negative-nai');
        expect(detectedRuleIds('夕方になりました。')).not.toContain('method-kata');
        expect(detectedRuleIds('地方に住む。')).not.toContain('method-kata');
        expect(detectedRuleIds('方法を確認します。')).not.toContain('method-kata');
        expect(detectedRuleIds('駅の方へ歩く。')).not.toContain('method-kata');
        expect(detectedRuleIds('からあげを食べた。')).not.toContain('suffix-ge');
        expect(detectedRuleIds('おかげです。')).not.toContain('suffix-ge');
        expect(detectedRuleIds('わがままを言う。')).not.toContain('state-mama');
        expect(detectedRuleIds('ありがたいです。')).not.toContain('difficulty-gatai');
        expect(detectedRuleIds('おかわりに水をください。')).not.toContain('substitution-kawari-ni');
        expect(detectedRuleIds('ときめきました。')).not.toContain('suffix-meku');
        expect(detectedRuleIds('かわいそうです。')).not.toContain('appearance-sou');
        expect(detectedRuleIds('かわいそうです。')).not.toContain('hearsay-sou-da');
        expect(detectedRuleIds('ようこそ日本へ。')).not.toContain('emphasis-koso');
        expect(detectedRuleIds('チャンスを得る。')).not.toContain('possibility-eru-enai');
        expect(detectedRuleIds('心得ることが大切です。')).not.toContain('possibility-eru-enai');
        expect(detectedRuleIds('不気味です。')).not.toContain('suffix-gimi');
        expect(detectedRuleIds('たて書きです。')).not.toContain('fresh-tate');
        expect(detectedRuleIds('すぶりに注意する。')).not.toContain('elapsed-buri-ni');
        expect(detectedRuleIds('この店はやすいです。')).not.toContain('ease-yasui-nikui');
        expect(detectedRuleIds('家族をささえています。')).not.toContain('emphasis-sae');
        expect(detectedRuleIds('彼は行くとか言っていた。')).not.toContain('examples-toka');
        expect(detectedRuleIds('私のは赤いです。')).not.toContain('nominalizer-no');
        expect(detectedRuleIds('これは私のだ。')).not.toContain('explanation-no-da');
        expect(detectedRuleIds('彼がする仕事です。')).not.toContain('sensation-ga-suru');
        expect(detectedRuleIds('雑にしてはいけません。')).not.toContain('standard-ni-shite-wa');
    });

    it('keeps precise positives for rules with nearby lexical traps', () => {
        expect(detectedRuleIds('許しがたい行為です。')).toContain('difficulty-gatai');
        expect(detectedRuleIds('炊きたてのご飯です。')).toContain('fresh-tate');
        expect(detectedRuleIds('名前さえ覚えていない。')).toContain('emphasis-sae');
        expect(detectedRuleIds('今年こそ合格したい。')).toContain('emphasis-koso');
        expect(detectedRuleIds('朝ご飯を食べないで来ました。')).toContain('without-naide');
        expect(detectedRuleIds('日曜日は掃除とか洗濯とかします。')).toContain('examples-toka');
        expect(detectedRuleIds('夢のような時間でした。')).toContain('similarity-you-da');
        expect(detectedRuleIds('外で大きな音がしました。')).toContain('sensation-ga-suru');
        expect(detectedRuleIds('初めてにしてはよくできました。')).toContain('standard-ni-shite-wa');
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

    it('makes Japanese grammar explanations lookupable without parsing the chrome labels', async () => {
        const [hint] = detectGrammarHints('データに基づいて判断します。');
        const html = await renderGrammarHints([hint], 'データに基づいて判断します。', { knownRuleIds: [], showKnown: false }, 'ja');
        const root = document.createElement('div');
        root.dataset.jpdbReaderRoot = 'true';
        root.innerHTML = html;

        const texts = nestedTextParsePlan(root, 20)?.targets.map(target => target.text) ?? [];

        expect(texts).toContain('に基づく');
        expect(texts).toContain('行動や判断の根拠や証拠を示します。');
        expect(texts).toContain('データに基づいて');
        expect(texts).not.toContain('検出箇所データに基づいて');
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

    it('renders repeated grammar rules once with an occurrence count', async () => {
        const hints = [
            grammarHint({ ruleId: 'particle-wo', name: 'を', index: 2, match: '本を' }),
            grammarHint({ ruleId: 'particle-de', name: 'で', index: 5, match: '駅で' }),
            grammarHint({ ruleId: 'particle-wo', name: 'を', index: 8, match: '水を' }),
        ];

        const html = await renderGrammarHints(hints, '本を駅で水を読む。', { knownRuleIds: [], showKnown: false });
        const root = document.createElement('div');
        root.innerHTML = html;

        expect(root.querySelector('.jpdb-reader-grammar-summary')?.textContent).toBe('2 shown');
        expect(root.querySelectorAll('li[data-grammar-rule-id]')).toHaveLength(2);
        expect(root.querySelectorAll('li[data-grammar-rule-id="particle-wo"]')).toHaveLength(1);
        expect(root.querySelector('li[data-grammar-rule-id="particle-wo"] .jpdb-reader-grammar-repeat')?.textContent).toBe('x2');
        expect(root.querySelector('li[data-grammar-rule-id="particle-de"] .jpdb-reader-grammar-repeat')).toBeNull();
    });

    it('counts hidden known grammar by distinct rule', async () => {
        const hints = [
            grammarHint({ ruleId: 'particle-wo', name: 'を', index: 2, match: '本を' }),
            grammarHint({ ruleId: 'particle-wo', name: 'を', index: 8, match: '水を' }),
            grammarHint({ ruleId: 'particle-de', name: 'で', index: 5, match: '駅で' }),
        ];

        const html = await renderGrammarHints(hints, '本を駅で水を読む。', {
            knownRuleIds: ['particle-wo'],
            showKnown: false,
        });
        const root = document.createElement('div');
        root.innerHTML = html;

        expect(root.querySelector('.jpdb-reader-grammar-summary')?.textContent).toBe('1 shown · 1 known hidden');
        expect(root.querySelectorAll('li[data-grammar-rule-id]')).toHaveLength(1);
        expect(root.querySelector('li[data-grammar-rule-id="particle-wo"]')).toBeNull();
    });

    it.each(listLocalGrammarRuleExamples())('renders Japanese i18n copy for $ruleId without English words', async ({ ruleId, example }) => {
        const hint = detectGrammarHints(example.japanese).find(item => item.ruleId === ruleId);
        expect(hint).toBeTruthy();

        const html = await renderGrammarHints([hint!], example.japanese, { knownRuleIds: [], showKnown: false }, 'ja');
        expect(textContent(html)).not.toMatch(ENGLISH_WORD_RE);
    });
});
