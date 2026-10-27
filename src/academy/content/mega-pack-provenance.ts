import type { LessonActivityBeat } from '../ui/lesson-activity-chapter';

type MegaPackPlayableSegmentId =
    | 'mega-pack-01-hiragana-quiz-a-ko'
    | 'mega-pack-05-momotarou-opening'
    | 'mega-pack-08-particle-cheatsheet';

type MegaPackPlayableChapterId = 'mega-kana-01' | 'mega-reader-01' | 'mega-materials-01';

interface MegaPackSourceProvenance {
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

interface MegaPackActivityMapping {
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

export const MEGA_PACK_READER_SOURCE: MegaPackSourceProvenance = Object.freeze({
    segmentId: 'mega-pack-05-momotarou-opening',
    sourceId: 'mega-pack:767b663768ee7185b8710ebdde7efebdc27bbfc706c8f667ea4c833dcde764af:mega-pack-05-momotarou-opening',
    relativePath: "05.Children's Books, Readers/Momotarou.pdf",
    payloadSha256: '767b663768ee7185b8710ebdde7efebdc27bbfc706c8f667ea4c833dcde764af',
    locus: Object.freeze({ kind: 'pdf-pages', pdfPages: Object.freeze([3, 4] as const), printedPages: Object.freeze([1, 3] as const) }),
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
