import fs from 'node:fs';
import path from 'node:path';
import {
    adaptAuthoredWeek,
    AUTHORED_WEEK_HASHES,
} from '../../src/academy/content/authored-week-adapter';
import { getAuthoredWeekRegistration } from '../../src/academy/content/lesson-content-registry';
import { createLessonOneSourceVocabularyActivities } from '../../src/academy/content/lesson-one-greeting-worksheet';
import { createLibraryVocabularySheet } from '../../src/academy/content/library-vocabulary-sheet';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import type { KanjiWritingService } from '../../src/academy/integration/yomu-bridge';
import { sha256File } from './helpers/hash-memo';

const PACKAGE_PATH = path.resolve('public/academy/content/lessons/002-l1-l01.json');

interface LessonOnePackage {
    readonly id: string;
    readonly components: readonly {
        readonly exercises?: readonly { readonly id: string }[];
    }[];
    readonly sourceCoverage: {
        readonly members: readonly { readonly payloadSha256: string }[];
        readonly coverageMap: readonly {
            readonly payloadSha256: string;
            readonly status: string;
        }[];
    };
}

function loadPackage() {
    const bytes = fs.readFileSync(PACKAGE_PATH);
    const sha256 = sha256File(PACKAGE_PATH);
    return {
        bytes,
        sha256,
        json: JSON.parse(bytes.toString('utf8')) as LessonOnePackage,
    };
}

describe('l1-l01 release integrity', () => {
    it('is registered at the canonical Class Week and remains byte-pinned', () => {
        const loaded = loadPackage();
        const registration = getAuthoredWeekRegistration('l1-l01');

        expect(registration).toMatchObject({
            kind: 'authored-week',
            filename: '002-l1-l01.json',
            packageId: 'l1-l01',
            classWeekId: 'l1-l01',
        });
        expect(loaded.json.id).toBe('l1-l01');
        expect(loaded.sha256).toBe(AUTHORED_WEEK_HASHES['l1-l01']);
    });

    it('projects every declared source exercise exactly once', () => {
        const loaded = loadPackage();
        const declaredIds = loaded.json.components.flatMap(component =>
            (component.exercises ?? []).map(exercise => `l1-l01/${exercise.id}`));
        const week = adaptAuthoredWeek(loaded.json, { path: PACKAGE_PATH, sha256: loaded.sha256 });
        const deliveredIds = week.activities.map(activity => activity.sourceQuestionId);

        expect(new Set(declaredIds).size).toBe(declaredIds.length);
        expect(new Set(deliveredIds).size).toBe(deliveredIds.length);
        expect(deliveredIds).toEqual(declaredIds);
    });

    it('keeps exact source coverage and declared substitutions distinguishable', () => {
        const loaded = loadPackage();
        const memberHashes = loaded.json.sourceCoverage.members.map(member => member.payloadSha256);
        const coverage = loaded.json.sourceCoverage.coverageMap;

        expect(memberHashes).toHaveLength(10);
        expect(coverage).toHaveLength(memberHashes.length);
        expect(new Set(memberHashes).size).toBe(memberHashes.length);
        expect(coverage.map(row => row.payloadSha256).sort()).toEqual([...memberHashes].sort());
        expect(coverage.some(row => row.status === 'gap-declared-unverified-substitute')).toBe(true);
        expect(coverage.some(row => row.status.startsWith('exact-source-'))).toBe(true);
        expect(coverage.some(row => row.status === 'source-image-preserved-yomu-contextual-key')).toBe(true);
    });

    it('retains the complete source vocabulary and extension denominators', async () => {
        const sourceVocabulary = createLessonOneSourceVocabularyActivities();
        const librarySheet = createLibraryVocabularySheet();
        const chapter = await loadLessonActivityChapter('l1-l01', {
            lookup: async () => null,
        } satisfies KanjiWritingService);

        expect(sourceVocabulary).toHaveLength(27);
        expect(librarySheet.items).toHaveLength(sourceVocabulary.length);
        expect(chapter?.beats).toHaveLength(4);
        expect(chapter?.beats[0]?.activity.kind).toBe('academy-greeting-worksheet');
        expect((chapter?.beats[0]?.activity as { payload?: { prompts?: unknown[] } }).payload?.prompts).toHaveLength(6);
    });
});
