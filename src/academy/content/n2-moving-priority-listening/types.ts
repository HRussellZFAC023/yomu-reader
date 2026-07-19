import type { N2OpeningActivityModel, N2OpeningPackage, N2OpeningProvenance } from '../n2-opening-kit';

export const N2_MOVING_PRIORITY_LISTENING_ACTIVITY_KIND = 'academy-n2-moving-priority-listening' as const;
export const N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID = 'n2-home-life-opening-05-listening' as const;

interface ReferenceOnlyRights {
    readonly state: 'user-permitted-local-reference-only';
    readonly sourceTextDelivery: 'not-delivered';
    readonly sourceImageDelivery: 'not-delivered';
    readonly sourceAudioDelivery: 'not-delivered';
    readonly learnerActivityText: 'original-yomu-authored';
}

export interface N2MovingPriorityListeningProvenance extends N2OpeningProvenance<typeof N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID> {
    readonly pronunciationReference: Readonly<{
        sourceScope: 'japanese-library'; sourceFamily: 'sou-matome'; sourceTitle: '日本語総まとめ N2 聴解';
        sourceId: string; relativePath: string; sourceDocumentSha256: string; sourceDocumentByteLength: 98934329;
        sourceLocus: Readonly<{ pdfPage: 13; printedPage: 13; section: '第1章 準備しよう'; item: '1 発音に関する聞き取り' }>;
        sourceLocusSha256: string; rights: ReferenceOnlyRights;
    }>;
    readonly pointReference: Readonly<{
        sourceScope: 'japanese-library'; sourceFamily: 'shin-kanzen'; sourceTitle: '新完全マスター聴解 N2';
        sourceId: string; relativePath: string; sourceDocumentSha256: string; sourceDocumentByteLength: 202381716;
        sourceLocus: Readonly<{ pdfPage: 13; printedPage: 4; section: '問題紹介'; item: '2 ポイント理解' }>;
        sourceLocusSha256: string; rights: ReferenceOnlyRights;
    }>;
    readonly sourceItem: Readonly<{
        sourceScope: 'soya-research'; sourceFamily: 'soya-jlpt';
        sourceId: string; relativePath: 'data/courses/jlpt_n2/mock_test_no1.js';
        sourceDocumentSha256: string; sourceDocumentByteLength: 292617;
        sourceItemId: 'n2_m1_listening_task_0_3'; sourceItemJsonSha256: string;
        sourceAudio: Readonly<{
            relativePath: 'assets/audio/n2_mock1/n2_m1_listening_task_0_3.mp3';
            packageUrl: '/academy/content/n2-moving-priority-listening/soya-n2-m1-listening-task-0-3.mp3';
            sha256: string; byteLength: 667700; mediaType: 'audio/mpeg';
        }>;
        sourceImage: Readonly<{
            relativePath: 'assets/images/n2_mock1/task_home.png';
            packageUrl: '/academy/content/n2-moving-priority-listening/soya-n2-m1-task-home.png';
            sha256: string; byteLength: 317807; mediaType: 'image/png';
        }>;
        sourceLocusSha256: string;
        rights: Readonly<{
            state: 'user-permitted-local-educational-use';
            authorization: 'explicit-user-request-2026-07-18-first-real-n2-source-tranche';
            sourceTextDelivery: 'post-attempt-transcript';
            sourceAnswerDelivery: 'after-attempt';
            sourceAudioDelivery: 'exact-soya-media-packaged-network-served';
            sourceImageDelivery: 'exact-soya-media-packaged-network-served';
            serviceWorkerPrecache: 'not-registered';
        }>;
    }>;
    readonly combinedSourceLocusSha256: string;
}

export type N2MovingPriorityListeningModel = N2OpeningActivityModel<
    typeof N2_MOVING_PRIORITY_LISTENING_ACTIVITY_KIND,
    'n2-moving-priority-listening-v1',
    typeof N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID,
    N2MovingPriorityListeningProvenance
>;
export type N2MovingPriorityListeningPackage = N2OpeningPackage<
    typeof N2_MOVING_PRIORITY_LISTENING_PACKAGE_ID,
    N2MovingPriorityListeningModel
>;
