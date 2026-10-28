import type { N2ExtensiveReadingModel } from './types';

const N2_EXTENSIVE_READING_PACKAGE_ID = 'n2-extensive-reading-01' as const;

export const N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS = Object.freeze([
    '「最近の若者の言葉の乱れが気になる」という嘆きは、いつの時代にも聞かれるものだ。新しい流行語や若者言葉、いわゆる「スラング」が次々と生まれ、大人はそれに眉をひそめる。しかし、言語学的な視点から見れば、言葉が変化するのは極めて自然な現象であり、むしろ言語が生きている証拠だと言える。',
    '言葉は、その時代を生きる人々の生活や文化、社会の価値観を反映して常に変化している。例えば、現在私たちが「正しい」日本語として使っている言葉の中にも、数百年前には存在しなかったものや、本来の意味から大きく変わってしまったものが数多くある。かつての「若者言葉」が、時間をかけて社会全体に定着し、やがて「標準語」として辞書に載ることも珍しくないのだ。',
    'もちろん、どのような場面でもスラングを使ってよいというわけではない。ビジネスや公的な場では、相手に敬意を払い、誤解を与えない正確な表現を用いる必要がある。しかし、日常会話の中で新しい言葉が生まれ、コミュニケーションの潤滑油として機能すること自体を否定すべきではない。言葉の変化を「乱れ」として一律に排除するのではなく、その背景にある社会の変化や新しい感性に目を向けることで、私たちは言葉の持つ豊かさや奥深さをより深く理解できるのではないだろうか。',
]);

const SOURCE_QUESTION = '言葉の変化について、筆者はどのように考えているか。';
const SOURCE_ANSWER = '言葉の変化は自然な現象であり、状況に応じて使い分けることが重要だが、新しい言葉が生まれること自体を否定すべきではない。';
const SOURCE_WRONG_ANSWERS = Object.freeze([
    '言葉は時代とともに変化していくものなので、若者が日常会話で標準語を使わなくなるのは当然のことだ。',
    'ビジネスなどの公的な場では正確な表現が求められるため、社会から若者言葉は完全に排除するべきである。',
    'かつての若者言葉が標準語になることもあるため、現在は誤りとされている言葉も積極的に使うべきだ。',
]);

export const N2_EXTENSIVE_READING_PROVENANCE = Object.freeze({
    packageId: N2_EXTENSIVE_READING_PACKAGE_ID,
    sourceScope: 'soya-research' as const,
    sourceId: 'soya-research:4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5:n2_m1_reading_long_2_1',
    relativePath: 'data/courses/jlpt_n2/mock_test_no1.js' as const,
    payloadSha256: '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5',
    sourceItemId: 'n2_m1_reading_long_2_1' as const,
    sourceItemSha256: 'df8d08ef13029aa0c3196a7a1ca9571372f51b39aa9a53de69c84844b9a5da9f',
    sourcePassageSha256: '1820d6f2ad94ab991c0532825dfd06ebf1cc544d704243227336091ed37efc2a',
    sourceLocus: Object.freeze({ kind: 'exported-array-item' as const, exportName: 'n2_mock_no1_pool' as const }),
    permission: 'user-permitted-local-educational-use' as const,
    answerVisibility: 'after-attempt' as const,
    sourceMediaState: 'none-declared-or-delivered' as const,
}) satisfies N2ExtensiveReadingModel['provenance'];

export function canonicalN2ExtensiveReadingSourceItem(): string {
    return [
        N2_EXTENSIVE_READING_PROVENANCE.sourceItemId,
        'reading',
        'READING',
        '180',
        N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS.join('\n'),
        SOURCE_QUESTION,
        SOURCE_ANSWER,
        ...SOURCE_WRONG_ANSWERS,
    ].join('\n') + '\n';
}
