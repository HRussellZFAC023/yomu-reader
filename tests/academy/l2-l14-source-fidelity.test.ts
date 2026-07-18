import { readFileSync } from 'node:fs';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const AUDIO = {
    a13: 'b61ec5374c6c31fb3c1d3cef4fee142e0b6ee2d79e5a7359d70df65f93d44d2d',
    a14: '72537c6e4c3eb82bb6800a4c52ec906abb0c7b58f94b1663573426289e62cf2d',
} as const;
const WORKSHEET = 'a2198ef675e48009c697cea535495e9bdf5785597f430448cc3a4385ff311499';
const UNRELATED_TRACKS = [
    '289b21f780998f2935689396532c5c7edb8262517ac0399bcb6ee344ac23545f',
    '485f02c47f934bb7334da1c13795836d6c7fb2fb44244555db22f5beca86830a',
] as const;

describe('l2-l14 chronological Chapter 29 source frontier', () => {
    const curriculum = JSON.parse(readFileSync(
        'public/academy/content/source-pipeline/curriculum-crosswalk.v1.json',
        'utf8',
    )) as { lessons: Array<Record<string, unknown>> };
    const tasks = JSON.parse(readFileSync(
        'public/academy/content/listening/listening-task-bindings.v1.json',
        'utf8',
    )) as { entries: Array<Record<string, any>> };
    const listening = JSON.parse(readFileSync(
        'public/academy/content/listening/listening-crosswalk.v1.json',
        'utf8',
    )) as { entries: Array<Record<string, any>> };
    const sourceInventory = JSON.parse(readFileSync(
        'public/academy/content/audio/source-inventory.v1.json',
        'utf8',
    )) as { bindings: Array<Record<string, any>> };

    it('advances exactly one Moodle/Minna unit while preserving the Genki gap', () => {
        const lesson = curriculum.lessons.find(row => row.lessonId === 'l2-l14');
        expect(lesson).toMatchObject({
            lessonOrder: 41,
            progressionGroup: 'level-3-2',
            moodle: { moduleId: 8121267, classOrder: 52 },
            minna: { sourceId: 'japanese-minna:29-29', range: [29, 29] },
            genki: null,
            status: 'gap-declared',
            gaps: ['missing-genki-prerequisite-anchor'],
        });
        expect(curriculum.lessons.find(row => row.lessonId === 'l2-l13')).toMatchObject({ lessonOrder: 40 });

        const directPackages = tasks.entries
            .filter(entry => entry.source.questionMapRef.includes('DIRECT_REVIEWED_'))
            .map(entry => entry.packageId);
        expect(directPackages).toContain('l2-l14');
        expect(curriculum.lessons
            .filter(row => directPackages.includes(row.lessonId))
            .every(row => Number(row.lessonOrder) <= 41)).toBe(true);
    });

    it('binds only the six worksheet picture tasks to the exact A-13/A-14 bytes', () => {
        const frontier = tasks.entries.filter(entry => entry.packageId === 'l2-l14');
        expect(frontier).toHaveLength(6);
        expect(frontier.filter(entry => entry.locator.endsWith('l2-l14-a13.mp3'))).toHaveLength(3);
        expect(frontier.filter(entry => entry.locator.endsWith('l2-l14-a14.mp3'))).toHaveLength(3);
        expect(new Set(frontier.map(entry => entry.source.audioSha256))).toEqual(new Set(Object.values(AUDIO)));
        expect(frontier.every(entry => entry.source.sourceQuestionId === undefined)).toBe(true);
        expect(frontier.every(entry => entry.sourceQuestionId.includes(WORKSHEET))).toBe(true);
        expect(frontier.every(entry => entry.verification.answerGate === 'after-attempt')).toBe(true);
        expect(JSON.stringify(frontier)).not.toMatch(/"correct"|"correctAnswer"|"answers"|"transcript"/i);

        for (const source of listening.entries.filter(entry => Object.values(AUDIO).includes(entry.source?.sha256))) {
            expect(sha256File(source.source.repositoryRelativePath.replace(/^apps\/yomu-reader\//u, ''))).toBe(source.source.sha256);
            expect(filesHaveSameContent(`public${source.delivery.url}`, source.source.repositoryRelativePath.replace(/^apps\/yomu-reader\//u, ''))).toBe(true);
            expect(filesHaveSameContent(`docs/public${source.delivery.url}`, source.source.repositoryRelativePath.replace(/^apps\/yomu-reader\//u, ''))).toBe(true);
        }
    });

    it('uses Japanese-folder duplicates as provenance, not extra curriculum tasks', () => {
        const duplicates = sourceInventory.bindings.filter(binding => (
            binding.sourceId === 'japanese-folder' && Object.values(AUDIO).includes(binding.sha256)
        ));
        expect(duplicates).toHaveLength(2);
        expect(duplicates.map(binding => binding.taskBindingReferences.length).sort()).toEqual([3, 3]);
        expect(duplicates.every(binding => (
            binding.status === 'canonical-source-match-task-bound'
            && binding.runtime === 'packaged-static'
            && binding.academyPackageReferences.some((reference: { packageId: string }) => reference.packageId === 'l2-l14')
        ))).toBe(true);
        expect(tasks.entries.filter(entry => Object.values(AUDIO).includes(entry.source.audioSha256)))
            .toHaveLength(6);
    });

    it('keeps unrelated Track 27/28 and all unsupported resource-family claims out', () => {
        const lesson = JSON.parse(readFileSync('public/academy/content/lessons/041-l2-l14.json', 'utf8')) as {
            sourceQuestionNormalization: { quarantine: { unresolvedMedia: Array<{ payloadSha256: string }> } };
        };
        const unresolved = lesson.sourceQuestionNormalization.quarantine.unresolvedMedia
            .map(item => item.payloadSha256);
        expect(unresolved).toEqual(expect.arrayContaining([...UNRELATED_TRACKS]));
        expect(tasks.entries.some(entry => UNRELATED_TRACKS.includes(entry.source.audioSha256))).toBe(false);

        const frontierMethods = tasks.entries
            .filter(entry => entry.packageId === 'l2-l14')
            .map(entry => entry.verification.method)
            .join(' ');
        expect(frontierMethods).toMatch(/no separate official Minna, Genki, Soya, or Shin Kanzen byte match is claimed/i);
    });

    it('keeps public and documentation source ledgers byte-identical', () => {
        for (const relative of [
            'academy/content/listening/listening-crosswalk.v1.json',
            'academy/content/listening/listening-task-bindings.v1.json',
            'academy/content/audio/source-inventory.v1.json',
        ]) {
            expect(filesHaveSameContent(`docs/public/${relative}`, `public/${relative}`)).toBe(true);
        }
    });
});
