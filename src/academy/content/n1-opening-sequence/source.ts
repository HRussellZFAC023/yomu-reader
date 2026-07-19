import type { N1OpeningSequenceModel } from './types';

export const N1_OPENING_SEQUENCE_PACKAGE_ID = 'n1-opening-sequence-01' as const;

/**
 * Exact, verbatim excerpts copied from independently verified local library
 * sources (hashes pinned below). These strings are learner-facing source
 * material, not Yomu-authored text, and must never be relabelled as such.
 */
export const N1_OPENING_SEQUENCE_DELIVERED_SOURCE = Object.freeze({
    readingAnchorTitleJa: '【対比】全体をつかもう',
    readingAnchorParagraphs: Object.freeze([
        '昔は、目にみえる権力やモラルに規制されていたが、',
        '今は、目にみえない情報に支配されている。',
        '今は昔よりも主体性と価値観を築き上げるのが難しい時代である。',
    ]),
    grammarExamples: Object.freeze([
        '話題のその本は、店頭に並べられたが早いか、飛ぶように売れていった。',
        '選挙戦が始まるや否や、あちこちからにぎやかな声が聞こえてきた。',
        '課長は部屋に入ってくるなり、大声でどなった。',
    ]),
    tobiraBridgeSentence:
        '日本は南北に長い国なので、南と北では気候が大きく違い、沖縄や九州で泳げる時に、北海道では雪が降っていることもあります。',
    listeningSourceTranscript:
        '番組の途中ですが、…沖縄地方で地震がありました。地震の詳しい情報は入り次第お伝えします。'
        + '該当する地域の方々は、倒れやすいものから離れてください。車を運転中の方は慌てずに、ゆっくり車を止めてください。'
        + 'えーあ、…午前5時41分ごろ、九州、沖縄地方で、やや強い地震がありました。沖縄北部は震度4…えー…ここで、津波警報、津波注意報の情報をお伝えします。'
        + '先ほどの地震で津波警報が出ました。'
        + '津波警報が出ているのは、沖縄地方です。予想される津波の高さは1mです。'
        + '津波警報が出ている海岸や河口付近の皆さんは、早く安全な高台に避難してください。',
    listeningSourceQuestionPromptJa: '放送の内容と合わないものはどれですか。',
    listeningSourceOptions: Object.freeze([
        Object.freeze({ id: 'okinawa-shindo-4', ja: '沖縄北部は震度4を観測した' }),
        Object.freeze({ id: 'tsunami-warning-issued', ja: '沖縄に津波警報が発令された' }),
        Object.freeze({ id: 'quake-time-0541', ja: '地震は午前5時41分ごろ発生した' }),
        Object.freeze({ id: 'tsunami-height-3m', ja: '3mの高さの津波が予想されている' }),
    ]),
    listeningSourceCorrectOptionId: 'tsunami-height-3m',
});

/**
 * Original Yomu-authored learner-facing transfer content. This is distinct
 * from, and does not reproduce, any exact source text above.
 */
export const N1_OPENING_SEQUENCE_AUTHORED = Object.freeze({
    readingTitleJa: '涼み処が数えなかった人',
    readingParagraphs: Object.freeze([
        '記録的な猛暑が続いた昨年、いくつかの自治体は、使われなくなった公民館や旧校舎を「涼み処」として日中開放した。扉を開けるや否や定員に達した日もあった一方、周知が追いつかず利用者が数人にとどまった地区も少なくなく、地域全体の安全が高まったとまでは言えない。',
        '利用者数は、たしかに需要の存在を示す。受付簿には、日中独居の高齢者や、冷房のない木造住宅に住む世帯が繰り返し名を連ねた。とはいえ、その数字が含まない人を調べて初めて、施策の評価は始まる。徒歩で会場まで行けない人や、送迎を頼める相手がいない人は、最初から記録の外に置かれているからだ。',
        'したがって、開放拠点の継続を判断する際には、来た人の多さと、来られなかった人の事情とを、別々の資料として扱う必要がある。前者は需要の証拠になり、後者は到達の限界を示す。両者を混ぜて「盛況だった」と総括した瞬間に、排除された住民は数字ごと見えなくなる。',
    ]),
    listeningScript:
        '田中さん、涼み処試行の報告づくりですが、会場の座席の配置と受付簿の集計はもう終わっています。'
        + '今朝、民生委員から新しい戸別訪問の記録が届きました。ただ、その記録をどう分類するかの基準は、まだ福祉課の確認が取れていません。'
        + 'ですから、まず分類基準の案を福祉課に送ってください。返事を待つ間に、自由記述の回答の匿名化を進めましょう。'
        + '訪問記録と受付簿は、基準が確定するまで別々のまま保管してください。急いで一つにまとめると、確認後の基準で分類をやり直せなくなります。印刷は明日です。',
    sourceListeningRationale: Object.freeze({
        ja: '放送では予想される津波の高さは1mと伝えられており、この選択肢の3mとは一致しない。',
        en: 'The broadcast states the predicted tsunami height as 1m, which does not match the 3m named in this option.',
    }),
    productionModelAnswer:
        '受付簿が示す利用者数は需要の証拠であり、涼み処を続ける理由になる。'
        + '一方で、徒歩で会場まで来られない住民は最初から記録の外にあり、この数字だけでは地域全体を語れない。'
        + 'まずは戸別訪問の記録と受付簿を別々に突き合わせ、送迎の小規模な試行を次の段階として検討するのが望ましい。',
});

const READING_ANCHOR_SOURCE_ID =
    'japanese-library:392f34d1e235ff89109ab1f71426737aeeb33a570d6f7373b05bd0d5eba9c139:pdf-page-015:contrast-global-structure';
const GRAMMAR_SOURCE_ID =
    'japanese-library:4fe2ce35f8fd92b9059d03dc38d37cb49f7811f96abee4367262ce7322fd2512:pdf-page-019:time-relation-forms';
const LISTENING_SOURCE_ID =
    'japanese-library:1ca85d234d05887627ed1e4c6ce4dc86d4d50762ae6fb0e65d5692039ecf92c4:pdf-page-043-110:jlpt-n1-chokai-practice-1';
const TOBIRA_BRIDGE_SOURCE_ID =
    'japanese-library:954dfd010fa9c77e5f276fdc42021c6305cc8d9e7c3ae9009825c302cc420d52:pdf-page-027:geography-reading-contrast';

const SOURCES = Object.freeze([
    Object.freeze({
        role: 'reading-anchor' as const,
        sourceFamily: 'shin-kanzen' as const,
        sourceId: READING_ANCHOR_SOURCE_ID,
        sourceTitle: '新完全マスター読解 N1',
        relativePath:
                'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N1/新完全マスター読解, N1 Shin kanzen masutā dokkai/新完全マスター読解, N1 Shin kanzen masutā dokkai, N1.pdf',
        sourceDocumentSha256: '392f34d1e235ff89109ab1f71426737aeeb33a570d6f7373b05bd0d5eba9c139',
        sourceDocumentByteLength: 45967033,
        sourcePageImageSha256: 'a37d88c36b0381af55bbc022d9f59a681a5f39f104bc4f1ac319caba7f1b0311',
        sourcePageImageByteLength: 716599,
        sourceLocus: Object.freeze({
            pdfPage: 15,
            printedPage: 5,
            section: '第1部: 評論・解説・エッセイなど / 1.文章のしくみを理解する',
            item: '【対比】全体をつかもう',
        }),
        sourceExcerptSha256: '1ca2bb7df52600687ea4f25055425db92fb24071b7efc2e43ef5c29373f18ba5',
    }),
    Object.freeze({
        role: 'grammar-anchor' as const,
        sourceFamily: 'shin-kanzen' as const,
        sourceId: GRAMMAR_SOURCE_ID,
        sourceTitle: '新完全マスター文法 N1',
        relativePath:
                'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N1/新完全マスター文法, N1 Shin kanzen masutā bunpō/新完全マスター文法, N1 Shin kanzen masutā bunpō, N1.pdf',
        sourceDocumentSha256: '4fe2ce35f8fd92b9059d03dc38d37cb49f7811f96abee4367262ce7322fd2512',
        sourceDocumentByteLength: 145569227,
        sourcePageImageSha256: 'be936f0580989dcf1588ff78036b8df123397be5d8179f674965a48895810223',
        sourcePageImageByteLength: 925454,
        sourceLocus: Object.freeze({
            pdfPage: 19,
            printedPage: 8,
            section: '第1部 文の文法1',
            item: '1課 時間関係',
        }),
        sourceExcerptSha256: '6ba9d26eaaf882ecfb6585b128ac35316d8b31155c0c9e524e351c1377ef0c78',
    }),
    Object.freeze({
        role: 'listening-anchor' as const,
        sourceFamily: 'so-matome' as const,
        sourceId: LISTENING_SOURCE_ID,
        sourceTitle: '日本語総まとめ N1, 聴解',
        relativePath:
                'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/日本語総まとめ N1-N3. Nihongo sōmatome/日本語総まとめ N1/日本語総まとめ N1, 聴解  Nihongo sōmatome Chōkai/日本語総まとめ N1, 聴解  Nihongo sōmatome N1, Chōkai + Answers.pdf',
        sourceDocumentSha256: '1ca85d234d05887627ed1e4c6ce4dc86d4d50762ae6fb0e65d5692039ecf92c4',
        sourceDocumentByteLength: 12646490,
        sourcePageImageSha256: '9639f0720b9e9a74f5d97e89f8241e43759730ac76bf6d74b735a2a2d1306aae',
        sourcePageImageByteLength: 99813,
        sourceLocus: Object.freeze({
            pdfPage: 43,
            printedPage: 41,
            section: '第3章 いろいろなタイプの話を聞こう / 1 情報を聞こう',
            item: '練習1番',
        }),
        secondaryPageImageSha256: 'd852bc911ec11d4ae01061c30fe1230ee4e5eb1a080bc739752546e3c9752186',
        secondaryPageImageByteLength: 157034,
        secondaryLocus: Object.freeze({
            pdfPage: 110,
            printedPage: 108,
            section: '第3章 いろいろなタイプの話を聞こう / 1 情報を聞こう',
            item: '練習1番: スクリプトと解答',
        }),
        sourceExcerptSha256: '99cae3d14288c4d7a70ecffb5ce388eefa64bb5233622ee3c5c30cf177fc5490',
    }),
    Object.freeze({
        role: 'transfer-bridge-reference' as const,
        sourceFamily: 'tobira' as const,
        sourceId: TOBIRA_BRIDGE_SOURCE_ID,
        sourceTitle: 'TOBIRA - Gateway to Advanced Japanese',
        relativePath:
            'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/TOBIRA - Gateway to Advanced Japanese/TOBIRA - Gateway to Advanced Japanese.pdf',
        sourceDocumentSha256: '954dfd010fa9c77e5f276fdc42021c6305cc8d9e7c3ae9009825c302cc420d52',
        sourceDocumentByteLength: 206162548,
        sourcePageImageSha256: '2eb1c50a1d3a328154cca24cc9cc5cc88ec78e90cc6de112f04d8c298a5251b2',
        sourcePageImageByteLength: 949466,
        sourceLocus: Object.freeze({
            pdfPage: 27,
            printedPage: 5,
            section: '第1課「日本の地理」読み物',
            item: 'lines 11-14',
        }),
        sourceExcerptSha256: 'b985e8a515b6f6448be6935e378cf48c1463cae561a8cceec8bb8118591c95b4',
    }),
]);

const DELIVERED_AUDIO = Object.freeze({
    relativePath:
        'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/日本語総まとめ N1-N3. Nihongo sōmatome/日本語総まとめ N1/日本語総まとめ N1, 聴解  Nihongo sōmatome Chōkai/CD1 - 日本語総まとめ N1, 聴解  Chōkai/55 Track 55.mp3',
    packageRelativePath: 'public/academy/content/n1-opening-sequence/audio/nihongo-somatome-n1-cd1-track-55.mp3',
    packageUrl: '/academy/content/n1-opening-sequence/audio/nihongo-somatome-n1-cd1-track-55.mp3',
    sha256: 'cd51361d718bc376d09ae3fd360f95719238cd2081fb3b6e8c2999acdb09081a',
    byteLength: 1175094,
    durationSeconds: 73.139375,
    track: 'CD1-55' as const,
    codec: Object.freeze({ format: 'mp3' as const, sampleRateHz: 44100, channels: 2, bitrateKbps: 128 }),
    state: 'package-local-exact-source' as const,
});

const GAP_EVIDENCE = Object.freeze({
    sourceId: 'soya-research:30e2bfbe3630bfd8a62045bf4883e551855737beed21ef7cc6b1f90c0436be49:jlpt-n1-mock-test-no1',
    repoRelativePath: 'references/soya-research/extracted-src-all/data/courses/jlpt_n1/mock_test_no1.js',
    sha256: '30e2bfbe3630bfd8a62045bf4883e551855737beed21ef7cc6b1f90c0436be49',
    byteLength: 76,
    state: 'inspected-empty-not-used' as const,
});

/** Canonical string whose SHA-256 must equal provenance.sourceSetSha256. */
export function canonicalN1OpeningSequenceSourceSet(): string {
    const lines: string[] = ['n1-opening-sequence-01:mixed-source-set:v2'];
    for (const source of SOURCES) {
        lines.push(
            source.role,
            source.sourceFamily,
            source.sourceId,
            source.sourceDocumentSha256,
            String(source.sourceDocumentByteLength),
            source.sourcePageImageSha256,
            String(source.sourcePageImageByteLength),
            String(source.sourceLocus.pdfPage),
            String(source.sourceLocus.printedPage),
            source.sourceLocus.section,
            source.sourceLocus.item,
            'secondaryPageImageSha256' in source ? source.secondaryPageImageSha256 : '',
            'secondaryPageImageByteLength' in source ? String(source.secondaryPageImageByteLength) : '',
            'secondaryLocus' in source ? String(source.secondaryLocus.pdfPage) : '',
            'secondaryLocus' in source ? String(source.secondaryLocus.printedPage) : '',
            'secondaryLocus' in source ? source.secondaryLocus.section : '',
            'secondaryLocus' in source ? source.secondaryLocus.item : '',
            source.sourceExcerptSha256,
        );
    }
    lines.push(
        'audio-exact',
        DELIVERED_AUDIO.sha256,
        String(DELIVERED_AUDIO.byteLength),
        String(DELIVERED_AUDIO.durationSeconds),
        DELIVERED_AUDIO.track,
        DELIVERED_AUDIO.packageUrl,
        'gap-evidence',
        GAP_EVIDENCE.repoRelativePath,
        GAP_EVIDENCE.sha256,
        String(GAP_EVIDENCE.byteLength),
        GAP_EVIDENCE.state,
    );
    return lines.join('\n') + '\n';
}

/** Canonical string whose SHA-256 must equal provenance.deliveredSourceSha256. */
export function canonicalN1OpeningSequenceDeliveredSource(): string {
    const source = N1_OPENING_SEQUENCE_DELIVERED_SOURCE;
    return [
        N1_OPENING_SEQUENCE_PACKAGE_ID,
        'exact-delivered-source',
        source.readingAnchorTitleJa,
        ...source.readingAnchorParagraphs,
        ...source.grammarExamples,
        source.tobiraBridgeSentence,
        source.listeningSourceTranscript,
        source.listeningSourceQuestionPromptJa,
        ...source.listeningSourceOptions.map(option => `${option.id}:${option.ja}`),
        source.listeningSourceCorrectOptionId,
    ].join('\n') + '\n';
}

/** Canonical string whose SHA-256 must equal provenance.authoredContentSha256. */
export function canonicalN1OpeningSequenceAuthoredContent(): string {
    const authored = N1_OPENING_SEQUENCE_AUTHORED;
    return [
        N1_OPENING_SEQUENCE_PACKAGE_ID,
        'original-yomu-authored',
        authored.readingTitleJa,
        ...authored.readingParagraphs,
        authored.listeningScript,
        authored.sourceListeningRationale.ja,
        authored.sourceListeningRationale.en,
        authored.productionModelAnswer,
    ].join('\n') + '\n';
}

export const N1_OPENING_SEQUENCE_PROVENANCE = Object.freeze({
    packageId: N1_OPENING_SEQUENCE_PACKAGE_ID,
    sourceScope: 'japanese-library' as const,
    sourceSetId: 'n1-opening-sequence-01:mixed-source-set:v2',
    sourceFamily: 'mixed' as const,
    sources: SOURCES,
    deliveredAudio: DELIVERED_AUDIO,
    gapEvidence: GAP_EVIDENCE,
    sourceSetSha256: 'f732c87dcbe3205e6ea134d35a033716327f393ffe31e7d1653c34d8ffad9f41',
    deliveredSourceSha256: '8868ae0cab3d25a55f0afff0d5414160ab191ebe99b5af62980fdbd8e2c5ae94',
    authoredContentSha256: 'c5e47f2b4d2e4bc33dc7481f678e8ac19c68194b53eb318441a5986912209f84',
    rights: Object.freeze({
        state: 'user-directed-package-local-short-excerpts-and-exact-track' as const,
        sourceTextDelivery: 'delivered-short-excerpts' as const,
        sourceImageDelivery: 'not-delivered' as const,
        sourceAudioDelivery: 'delivered-exact-track' as const,
        learnerActivityText: 'mixed-exact-source-excerpt-and-yomu-transfer' as const,
        playback: 'exact-source-audio-and-tts-transfer' as const,
    }),
    sourceMediaState: 'mixed-short-source-excerpts-and-package-local-audio' as const,
}) satisfies N1OpeningSequenceModel['provenance'];
