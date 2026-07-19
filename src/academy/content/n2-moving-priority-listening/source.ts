import { N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID, type N2MovingPriorityListeningProvenance } from './types';

const REFERENCE_RIGHTS = Object.freeze({
    state: 'user-permitted-local-reference-only' as const,
    sourceTextDelivery: 'not-delivered' as const,
    sourceImageDelivery: 'not-delivered' as const,
    sourceAudioDelivery: 'not-delivered' as const,
    learnerActivityText: 'original-yomu-authored' as const,
});

export const N2_MOVING_PRIORITY_TRANSCRIPT = Object.freeze([
    Object.freeze({ speaker: 'N' as const, text: '家で、夫と妻が話しています。夫はこの後、まず何をしなければなりませんか。' }),
    Object.freeze({ speaker: 'F' as const, text: 'あなた、週末の引っ越しの準備、進んでる？荷造り、だいぶ終わったわよ。' }),
    Object.freeze({ speaker: 'M' as const, text: 'うん、僕も自分の部屋の本は箱に詰めたよ。あとは、粗大ごみをどうするかだな。この古い本棚と机、持っていけないし。' }),
    Object.freeze({ speaker: 'F' as const, text: 'ああ、それね。市のサービスに電話して予約しないと。確か、シールを買って貼っておくのよね。' }),
    Object.freeze({ speaker: 'M' as const, text: 'そうそう。電話は僕がしておくよ。それから、段ボールが足りなくなりそうだから、スーパーにもらいに行かないと。' }),
    Object.freeze({ speaker: 'F' as const, text: '段ボールは、さっき私が買い物ついでにもらってきたから大丈夫よ。玄関に置いてあるわ。' }),
    Object.freeze({ speaker: 'M' as const, text: 'あ、本当？助かる。じゃあ、まず粗大ごみの申し込みの電話をしちゃうよ。番号、わかる？' }),
    Object.freeze({ speaker: 'F' as const, text: 'ええ、冷蔵庫に貼ってあるチラシに書いてあるわ。電話が終わったら、台所の食器、一緒に箱詰めするの手伝ってくれる？割れ物だから一人じゃ大変で。' }),
    Object.freeze({ speaker: 'M' as const, text: 'わかった。じゃあ、電話、さっと済ませてくる。' }),
    Object.freeze({ speaker: 'N' as const, text: '夫はこの後、まず何をしなければなりませんか。' }),
]);
export const N2_MOVING_PRIORITY_ANSWER = '粗大ごみの収集を申し込む';
export const N2_MOVING_PRIORITY_WRONG_ANSWERS = Object.freeze([
    'スーパーに段ボールをもらいに行く',
    '台所の食器を箱詰めする',
    '古い本棚と机を玄関に運ぶ',
]);

export const N2_MOVING_PRIORITY_LISTENING_PROVENANCE = Object.freeze({
    packageId: N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID,
    answerVisibility: 'after-attempt' as const,
    pronunciationReference: Object.freeze({
        sourceScope: 'japanese-library' as const, sourceFamily: 'sou-matome' as const, sourceTitle: '日本語総まとめ N2 聴解' as const,
        sourceId: 'japanese-library:4b8f5d6d18f3c7bd06da6701c6cfad7890d9430f09b0ccf4c29ddacd9143f9aa:pdf-page-013:pronunciation-cues',
        relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/日本語総まとめ N1-N3. Nihongo sōmatome/日本語総まとめ N2/日本語総まとめ N2, 聴解  Nihongo sōmatome Chōkai/日本語総まとめ N2, 聴解  Nihongo sōmatome N2, Chōkai.pdf',
        sourceDocumentSha256: '4b8f5d6d18f3c7bd06da6701c6cfad7890d9430f09b0ccf4c29ddacd9143f9aa', sourceDocumentByteLength: 98934329 as const,
        sourceLocus: Object.freeze({ pdfPage: 13 as const, printedPage: 13 as const, section: '第1章 準備しよう' as const, item: '1 発音に関する聞き取り' as const }),
        sourceLocusSha256: '062d7b9521f3efd3d2b03b023dbfcfd15b900d08f97f2bd8d2d39063ca9e0892', rights: REFERENCE_RIGHTS,
    }),
    pointReference: Object.freeze({
        sourceScope: 'japanese-library' as const, sourceFamily: 'shin-kanzen' as const, sourceTitle: '新完全マスター聴解 N2' as const,
        sourceId: 'japanese-library:b3c6d199a7c1d0f34fd76da34a1b9426cd98ae62c08ef7d970848e9e0734f1f8:pdf-page-013:point-comprehension',
        relativePath: 'Resource Packs/Japanese Language Learning Pack - Learn Japanese!/07 Japanese N3-N1/新完全マスター N3-N1. Shin kanzen masutā/新完全マスター N2/新完全マスター聴解, N2 Shin kanzen masutā chōkai/新完全マスター聴解, N2 Shin kanzen masutā chōkai, N2.pdf',
        sourceDocumentSha256: 'b3c6d199a7c1d0f34fd76da34a1b9426cd98ae62c08ef7d970848e9e0734f1f8', sourceDocumentByteLength: 202381716 as const,
        sourceLocus: Object.freeze({ pdfPage: 13 as const, printedPage: 4 as const, section: '問題紹介' as const, item: '2 ポイント理解' as const }),
        sourceLocusSha256: '6350411a5bcc6a1d1658e08c8c4279f17d32f6ed8751e4aa0e4c8459db060310', rights: REFERENCE_RIGHTS,
    }),
    sourceItem: Object.freeze({
        sourceScope: 'soya-research' as const, sourceFamily: 'soya-jlpt' as const,
        sourceId: 'soya-research:4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5:n2_m1_listening_task_0_3',
        relativePath: 'data/courses/jlpt_n2/mock_test_no1.js' as const,
        sourceDocumentSha256: '4665de0aab5656717c930508ee9b92e60d11f71d5030482b86ea31b7a50b5aa5', sourceDocumentByteLength: 292617 as const,
        sourceItemId: 'n2_m1_listening_task_0_3' as const, sourceItemJsonSha256: '29438b237e0698d53a3dedc56e3553d19d7d283ecb3b8aa8b270cd952dd8abb5',
        sourceAudio: Object.freeze({
            relativePath: 'assets/audio/n2_mock1/n2_m1_listening_task_0_3.mp3' as const,
            packageUrl: '/academy/content/n2-moving-priority-listening/soya-n2-m1-listening-task-0-3.mp3' as const,
            sha256: '52bcc28d845bfbd4fa2cff6a2a2c036e72940f988076528f68a80bf508d37c42', byteLength: 667700 as const, mediaType: 'audio/mpeg' as const,
        }),
        sourceImage: Object.freeze({
            relativePath: 'assets/images/n2_mock1/task_home.png' as const,
            packageUrl: '/academy/content/n2-moving-priority-listening/soya-n2-m1-task-home.png' as const,
            sha256: 'f83c5f590d046b22281762da385004877f69d1b753fddeb6defff9fe217eb2b3', byteLength: 317807 as const, mediaType: 'image/png' as const,
        }),
        sourceLocusSha256: 'cde2ed514c0956537eefd3b7c5ee2d596af14458be98ee4bb7729f3ca39a66c6',
        rights: Object.freeze({
            state: 'user-permitted-local-educational-use' as const,
            authorization: 'explicit-user-request-2026-07-18-first-real-n2-source-tranche' as const,
            sourceTextDelivery: 'post-attempt-transcript' as const,
            sourceAnswerDelivery: 'after-attempt' as const,
            sourceAudioDelivery: 'exact-soya-media-packaged-network-served' as const,
            sourceImageDelivery: 'exact-soya-media-packaged-network-served' as const,
            serviceWorkerPrecache: 'not-registered' as const,
        }),
    }),
    combinedSourceLocusSha256: 'ec06a60b51a9fe27b4f4c9f0fdccc96a9ac79bcab94dc46efdd6cd2b161dcaa8',
}) satisfies N2MovingPriorityListeningProvenance;

export function canonicalN2MovingPriorityPronunciationLocus(): string {
    const source = N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pronunciationReference;
    return [source.sourceId, source.sourceDocumentSha256, String(source.sourceDocumentByteLength), source.relativePath,
        String(source.sourceLocus.pdfPage), String(source.sourceLocus.printedPage), source.sourceLocus.section, source.sourceLocus.item,
    ].join('\n') + '\n';
}
export function canonicalN2MovingPriorityPointLocus(): string {
    const source = N2_MOVING_PRIORITY_LISTENING_PROVENANCE.pointReference;
    return [source.sourceId, source.sourceDocumentSha256, String(source.sourceDocumentByteLength), source.relativePath,
        String(source.sourceLocus.pdfPage), String(source.sourceLocus.printedPage), source.sourceLocus.section, source.sourceLocus.item,
    ].join('\n') + '\n';
}
export function canonicalN2MovingPrioritySoyaLocus(): string {
    const source = N2_MOVING_PRIORITY_LISTENING_PROVENANCE.sourceItem;
    return [source.sourceId, source.sourceDocumentSha256, String(source.sourceDocumentByteLength), source.relativePath,
        source.sourceItemId, source.sourceItemJsonSha256, source.sourceAudio.sha256, String(source.sourceAudio.byteLength),
        source.sourceImage.sha256, String(source.sourceImage.byteLength),
    ].join('\n') + '\n';
}
export function canonicalN2MovingPriorityCombinedLocus(): string {
    const source = N2_MOVING_PRIORITY_LISTENING_PROVENANCE;
    return `${source.pronunciationReference.sourceLocusSha256}\n${source.pointReference.sourceLocusSha256}\n${source.sourceItem.sourceLocusSha256}\n`;
}
