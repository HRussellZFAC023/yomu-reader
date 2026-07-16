import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

export type MegaPackPlayableSegmentId =
    | 'mega-pack-01-hiragana-quiz-a-ko'
    | 'mega-pack-05-momotarou-opening'
    | 'mega-pack-08-particle-cheatsheet';

export type MegaPackPlayableChapterId = 'mega-kana-01' | 'mega-reader-01' | 'mega-materials-01';

export interface MegaPackSourceProvenance {
    readonly segmentId: MegaPackPlayableSegmentId;
    readonly sourceId: string;
    readonly relativePath: string;
    readonly payloadSha256: string;
    readonly locus: Readonly<{
        kind: 'pdf-pages';
        pdfPages: readonly [number, number];
        printedPages?: readonly [number, number];
    }>;
    readonly permission: 'user-permitted-verbatim-educational-use';
}

export interface MegaPackActivityMapping {
    readonly chapterId: MegaPackPlayableChapterId;
    readonly skills: readonly string[];
    readonly jlpt: readonly string[];
    readonly conceptIds: readonly string[];
}

export interface MegaPackActivityBeat extends LessonActivityBeat {
    readonly sourceSegmentId: MegaPackPlayableSegmentId;
    readonly provenance: MegaPackSourceProvenance;
    readonly mapping: MegaPackActivityMapping;
}

export const MEGA_PACK_WRITING_SOURCE: MegaPackSourceProvenance = Object.freeze({
    segmentId: 'mega-pack-01-hiragana-quiz-a-ko',
    sourceId: 'mega-pack:bc6e047118c8bf3322571e198370c713ba39df676b0e5ec5720ebb12d4167ff4:mega-pack-01-hiragana-quiz-a-ko',
    relativePath: '01.Japanese Writing System/Hiragana Katakana Worksheet/Hiragana Katakana Worksheet.pdf',
    payloadSha256: 'bc6e047118c8bf3322571e198370c713ba39df676b0e5ec5720ebb12d4167ff4',
    locus: Object.freeze({ kind: 'pdf-pages', pdfPages: Object.freeze([4, 4] as const), printedPages: Object.freeze([2, 2] as const) }),
    permission: 'user-permitted-verbatim-educational-use',
});

export const MEGA_PACK_READER_SOURCE: MegaPackSourceProvenance = Object.freeze({
    segmentId: 'mega-pack-05-momotarou-opening',
    sourceId: 'mega-pack:767b663768ee7185b8710ebdde7efebdc27bbfc706c8f667ea4c833dcde764af:mega-pack-05-momotarou-opening',
    relativePath: "05.Children's Books, Readers/Momotarou.pdf",
    payloadSha256: '767b663768ee7185b8710ebdde7efebdc27bbfc706c8f667ea4c833dcde764af',
    locus: Object.freeze({ kind: 'pdf-pages', pdfPages: Object.freeze([3, 4] as const), printedPages: Object.freeze([1, 3] as const) }),
    permission: 'user-permitted-verbatim-educational-use',
});

export const MEGA_PACK_MATERIALS_SOURCE: MegaPackSourceProvenance = Object.freeze({
    segmentId: 'mega-pack-08-particle-cheatsheet',
    sourceId: 'mega-pack:ac76bbec8250b201e59e61073cd3cdd6a797a5d822b8f9e3e070a0fa9fe0bffa:mega-pack-08-particle-cheatsheet',
    relativePath: '08.Miscellaneous/Cheatsheets/japanese-particles-cheatsheet.pdf',
    payloadSha256: 'ac76bbec8250b201e59e61073cd3cdd6a797a5d822b8f9e3e070a0fa9fe0bffa',
    locus: Object.freeze({ kind: 'pdf-pages', pdfPages: Object.freeze([1, 1] as const) }),
    permission: 'user-permitted-verbatim-educational-use',
});

export function megaPackBeat(
    beat: LessonActivityBeat,
    provenance: MegaPackSourceProvenance,
    mapping: MegaPackActivityMapping,
): MegaPackActivityBeat {
    if (!mapping.conceptIds.every(conceptId => beat.activity.conceptIds.includes(conceptId))) {
        throw new TypeError(`Mega Pack beat ${beat.id} does not expose every mapped Concept.`);
    }
    return Object.freeze({
        ...beat,
        sourceSegmentId: provenance.segmentId,
        provenance,
        mapping: Object.freeze({
            ...mapping,
            skills: Object.freeze([...mapping.skills]),
            jlpt: Object.freeze([...mapping.jlpt]),
            conceptIds: Object.freeze([...mapping.conceptIds]),
        }),
    });
}
