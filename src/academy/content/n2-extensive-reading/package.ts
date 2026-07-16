import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { MiningRequest } from '../../integration/yomu-bridge';
import { N2_EXTENSIVE_READING_PROVENANCE, N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS } from './source';
import type { N2ExtensiveReadingPackage, N2ExtensiveReadingQuestion } from './types';

const TRANSFER_PARAGRAPHS = Object.freeze([
    '市立資料館が古い手紙や写真をデジタル化するのは、資料を傷みから守るためだけではない。遠方に住む人にも公開できれば、これまで専門家の説明を待つほかなかった記録を、市民自身が別の資料と結び付けて読めるようになる。もっとも、検索しやすくなったからといって、記録の背景まで自動的に理解できるわけではない。',
    'そこで資料館は、画像の枚数を増やすことにとどまらず、撮影された年代や寄贈者の証言も併せて示す方針を取った。保存と公開は終点ではなく、複数の読み方を確かめられる入口だという考えである。利用者にも、目についた一語だけで判断せず、前後の記録へ読み進める姿勢が求められる。',
]);

export function createN2ExtensiveReadingPackage(): N2ExtensiveReadingPackage {
    const activity = Object.freeze({
        id: 'activity:n2-extensive-reading:three-pass',
        kind: 'academy-n2-extensive-reading' as const,
        sourceQuestionId: N2_EXTENSIVE_READING_PROVENANCE.sourceId,
        conceptIds: [
            'reading:extensive-preview',
            'reading:paragraph-role-tracking',
            'reading:flow-before-lookup',
            'reading:register-qualification',
            'reading:n1-transfer-synthesis',
        ],
        responseKind: 'n2-n1-extensive-reading-v1' as const,
        curriculumPhase: 'assessed-recognition' as const,
        prompt: {
            ja: '三つの読み方を先に練習し、N2長文からN1相当の新しい文章へ移しましょう。',
            en: 'Learn three extensive-reading moves first, then carry them from an N2 long text into a fresh N1 passage.',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: {
            kind: 'context' as const,
            title: { ja: '止まらずに全体をつかむ', en: 'Keep moving to preserve the whole' },
            entries: [
                { japanese: '最初と最後を見て、話題と着地点を予測する。' },
                { japanese: 'しかし・例えば・もちろんを道しるべにする。' },
                { japanese: '未知語は印だけ付け、流れを止める語だけ後で調べる。' },
            ],
        },
        provenance: N2_EXTENSIVE_READING_PROVENANCE,
        payload: {
            strategy: [
                strategy('preview', '入口と出口を先に見る', 'Preview the entrance and exit', '最初の二文と最後の一文を見て、話題と筆者の着地点を仮置きします。', 'Read the first two sentences and the final sentence to predict the topic and destination.'),
                strategy('pivots', '段落の役割を接続語で追う', 'Track paragraph roles through pivots', '「しかし」「例えば」「もちろん」を見つけ、問題提起・例・限定の役割を追います。', 'Use shikashi, tatoeba, and mochiron to track problem, example, and qualification.'),
                strategy('flow', '未知語より流れを優先する', 'Protect flow before lookup', '未知語には印を付けて進み、主張を追えない語だけ全文の後で調べます。', 'Mark unknown words and continue; look up only words that still block the claim after the full read.'),
            ],
            source: {
                title: { ja: 'Soya N2 長文: 言葉の変化', en: 'Soya N2 long reading: language change' },
                paragraphs: N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS,
                authorship: 'exact-soya-source-item' as const,
                timing: 'untimed' as const,
            },
            transfer: {
                title: { ja: 'N1転移: 資料館のデジタル化', en: 'N1 transfer: digitising a local archive' },
                paragraphs: TRANSFER_PARAGRAPHS,
                authorship: 'original-yomu-n1-transfer' as const,
            },
            reflection: {
                label: { ja: '止まらずに読めた手がかり', en: 'The cue that helped you keep moving' },
                guidance: { ja: '任意: 接続語、段落の役割、後回しにした未知語のどれかを短く記録してください。', en: 'Optional: note a pivot, paragraph role, or unknown word you safely postponed.' },
                authorship: 'learner-authored-ungraded' as const,
            },
            questions: [
                question('source-gist', 'source-comprehension', '本文全体の主張に最も近いものはどれですか。', 'Which choice best states the passage’s overall claim?', [
                    option('balanced-change', '言葉の変化は自然だが、場面に応じた使い分けも必要である。', 'Language change is natural, while register still matters.'),
                    option('ban-slang', '新しい言葉は公私を問わず排除すべきである。', 'New words should be excluded in every setting.'),
                    option('slang-everywhere', '変化は自然なので、公的な場でもスラングを使うべきである。', 'Because change is natural, slang belongs in public settings too.'),
                ], 'balanced-change', 'source-gist'),
                question('source-role', 'source-comprehension', '第二段落は全体の中でどんな役割を果たしていますか。', 'What role does paragraph two play in the whole?', [
                    option('historical-support', '言葉が変化し定着する例を示し、第一段落の見方を支える。', 'It supports paragraph one with examples of change becoming established.'),
                    option('business-rule', '公的な場での言葉の規則だけを列挙する。', 'It only lists rules for public language.'),
                    option('final-rejection', '若者言葉を全面的に否定する結論を述べる。', 'It concludes by rejecting youth language entirely.'),
                ], 'historical-support', 'source-paragraph-role'),
                question('source-qualification', 'source-comprehension', '「もちろん」から始まる限定として正しいものはどれですか。', 'Which qualification begins with mochiron?', [
                    option('register-matters', '公的な場では敬意と正確さが必要である。', 'Public settings require respect and accuracy.'),
                    option('no-change', '言葉は本来の意味から変わってはならない。', 'Words must never change from their original meanings.'),
                    option('dictionary-first', '辞書に載るまで新語を使ってはならない。', 'New words cannot be used before entering a dictionary.'),
                ], 'register-matters', 'source-register'),
                question('transfer-gist', 'n1-transfer', '資料館の方針の中心は何ですか。', 'What is central to the archive’s policy?', [
                    option('contextual-entry', '画像と背景情報を結び、複数の読み方を確かめる入口を作ること。', 'Link images with context to create an entry point for testing multiple readings.'),
                    option('image-count', '背景情報を省き、画像の数だけを増やすこと。', 'Omit context and increase only the image count.'),
                    option('expert-only', '記録の解釈を専門家だけに限定すること。', 'Restrict interpretation to specialists.'),
                ], 'contextual-entry', 'transfer-gist'),
                question('transfer-strategy', 'n1-transfer', '利用者に求められる読み方はどれですか。', 'Which reading behaviour does the passage ask of users?', [
                    option('read-around', '一語だけで決めず、前後の記録へ読み進める。', 'Avoid deciding from one word and continue into surrounding records.'),
                    option('lookup-all', '未知語が出るたびに読みを止める。', 'Stop reading at every unknown word.'),
                    option('first-image', '最初に見た画像だけで結論を出す。', 'Conclude from the first image alone.'),
                ], 'read-around', 'transfer-flow'),
            ],
            passScore: 1 as const,
            feedback: {
                pass: { explanation: { ja: '全体の主張、段落の役割、限定を保ったまま、新しい文章へ読み方を移せました。', en: 'You preserved gist, paragraph roles, and qualification while transferring the routine to a fresh text.' } },
                lapse: {
                    explanation: { ja: '一文の強い語に止まらず、最初と最後、接続語、各段落の役割をもう一度つないでください。', en: 'Reconnect the beginning and ending, pivots, and paragraph roles instead of stopping on one strong phrase.' },
                    repairPrompt: { ja: '各段落を「問題・根拠・限定／結論」の一語で表してから、選択肢を選び直してください。', en: 'Label each paragraph problem, support, or qualification/conclusion, then choose again.' },
                    nearbyExample: { ja: '「便利だ。しかし、万能というわけではない。」なら、後半の限定まで残して要約します。', en: 'For “It is convenient. However, it is not universal,” keep the qualification in the summary.' },
                },
            },
            reviewTargets: [
                review('preview', 'reading:extensive-preview', '着地点を仮置きする', 'ちゃくちてんをかりおきする', ['predict the destination of a text'], N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS[0], ['source-gist', 'transfer-gist']),
                review('paragraph-role', 'reading:paragraph-role-tracking', '定着する', 'ていちゃくする', ['become established'], N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS[1], ['source-paragraph-role']),
                review('qualification', 'reading:register-qualification', '一律に排除する', 'いちりつにはいじょする', ['reject uniformly'], N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS[2], ['source-register']),
                review('flow', 'reading:flow-before-lookup', '前後へ読み進める', 'ぜんごへよみすすめる', ['continue into the surrounding context'], TRANSFER_PARAGRAPHS[1], ['transfer-flow']),
                review('synthesis', 'reading:n1-transfer-synthesis', '〜にとどまらず', undefined, ['not limited to; going beyond'], TRANSFER_PARAGRAPHS[1], ['transfer-gist']),
            ],
        },
    });

    return Object.freeze({
        id: 'n2-extensive-reading-01' as const,
        band: 'N2-to-N1' as const,
        prerequisites: Object.freeze([
            prerequisite('reading:n2-main-idea', 'N2短文の主張を選べる。', 'Can identify the claim of an N2 short text.'),
            prerequisite('reading:n2-connectives', '主要な逆接・例示・限定の接続語を追える。', 'Can follow common contrast, example, and qualification pivots.'),
            prerequisite('strategy:deferred-lookup', '未知語を一時保留して文脈を読み続けられる。', 'Can defer an unknown word while continuing through context.'),
        ]),
        activity,
        readerSrs: Object.freeze({
            readerSurfaceIds: Object.freeze([
                ...N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS.map((_, index) => `reader:n2-extensive-reading-01:source:paragraph-${index + 1}`),
                ...TRANSFER_PARAGRAPHS.map((_, index) => `reader:n2-extensive-reading-01:transfer:paragraph-${index + 1}`),
            ]),
            miningRequests: Object.freeze(miningRequests()),
        }),
    });
}

function prerequisite(conceptId: string, ja: string, en: string) {
    return Object.freeze({ conceptId, minimumEvidence: 'introduced-and-attempted' as const, reason: Object.freeze({ ja, en }) });
}

function strategy(id: 'preview' | 'pivots' | 'flow', ja: string, en: string, instructionJa: string, instructionEn: string) {
    return Object.freeze({ id, title: Object.freeze({ ja, en }), instruction: Object.freeze({ ja: instructionJa, en: instructionEn }) });
}

function option(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: Object.freeze({ ja, en }) });
}

function question(id: string, stage: N2ExtensiveReadingQuestion['stage'], ja: string, en: string, options: readonly ReturnType<typeof option>[], correctOptionId: string, errorTag: string): N2ExtensiveReadingQuestion {
    return Object.freeze({ id, stage, prompt: Object.freeze({ ja, en }), options: Object.freeze(options), correctOptionId, errorTag });
}

function review(suffix: string, conceptId: string, expression: string, reading: string | undefined, meanings: readonly string[], sentence: string, repairFor: readonly string[]) {
    return Object.freeze({ id: `review:n2-extensive-reading-01:${suffix}`, conceptId, expression, ...(reading ? { reading } : {}), meanings: Object.freeze([...meanings]), sentence, repairFor: Object.freeze([...repairFor]) });
}

function miningRequests(): MiningRequest[] {
    return [
        { expression: '定着する', sentence: N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS[1], sourceTitle: 'Soya N2 long reading: n2_m1_reading_long_2_1', conceptIds: ['reading:paragraph-role-tracking'] },
        { expression: '一律に排除する', sentence: N2_EXTENSIVE_READING_SOURCE_PARAGRAPHS[2], sourceTitle: 'Soya N2 long reading: n2_m1_reading_long_2_1', conceptIds: ['reading:register-qualification'] },
        { expression: '〜にとどまらず', sentence: TRANSFER_PARAGRAPHS[1], sourceTitle: 'Yomu original N1 transfer: 資料館のデジタル化', conceptIds: ['reading:n1-transfer-synthesis', 'reading:flow-before-lookup'] },
    ];
}
