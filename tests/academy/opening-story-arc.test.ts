import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';

const STORY_ROOT = path.resolve('src/academy/content/story-sources');
const ARRIVAL_PATH = path.join(STORY_ROOT, 'opening-arrival-bridge.v2.json');
const CHAPTER_PATH = path.join(STORY_ROOT, 's1e01-the-blank-atlas.v2.json');
const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');
const PROVENANCE_PATH = path.resolve(
    'public/academy/content/lessons/lesson-zero/provenance.v1.json',
);

type StoryNodeKind = 'activity' | 'checkpoint' | 'choice' | 'command' | 'line' | 'narration' | 'stage';

interface StoryNode {
    readonly kind: StoryNodeKind;
    readonly id: string;
    readonly speakerId?: string;
    readonly variants?: Record<string, { japanese: string; reading: string; english: string }>;
    readonly options?: readonly ChoiceOption[];
    readonly convergence?: string;
    readonly hook?: { lessonId: string; componentType: string; exerciseId: string };
    readonly requiredEvidence?: { kind: string; activityId: string };
    readonly resumeContext?: string;
    readonly onReady?: string;
    readonly onRepair?: string;
    readonly onDefer?: string;
    readonly command?: Record<string, unknown> & { type: string };
    readonly when?: {
        choiceId: string;
        optionId?: string;
        optionIds?: readonly string[];
    };
}

interface ChoiceOption {
    readonly id: string;
    readonly action: string;
    readonly japaneseByBand: Readonly<Record<string, string>>;
    readonly records: readonly string[];
    readonly next: string;
}

interface StoryScene {
    readonly id: string;
    readonly locationId: string;
    readonly checkpointOnEnter: boolean;
    readonly curriculum?: { sectionId: string; order: number; missionId?: string };
    readonly nodes: readonly StoryNode[];
    readonly exit: { checkpoint: boolean; next: string | null };
}

interface StoryCastUse {
    readonly castId: string;
    readonly role: string;
    readonly portrayal: string;
    readonly portraitAsset?: { id: string; sha256: string };
}

interface StoryMission {
    readonly id: string;
    readonly choiceOptionId: string;
    readonly sceneId: string;
    readonly hostIds: readonly string[];
    readonly locationId: string;
    readonly openingActivityId: string;
    readonly transferActivityId: string;
    readonly mementoId: string;
}

interface StorySourceAnchor {
    readonly order: number;
    readonly role: string;
    readonly sourceSha256: string;
    readonly activityIds?: readonly string[];
    readonly sourceQuestionIds?: readonly string[];
    readonly policy: string;
}

interface StoryPackage {
    readonly schema: string;
    readonly id: string;
    readonly revision: string;
    readonly canonicality: string;
    readonly season: number | string;
    readonly chapter?: number;
    readonly sourceSafety: {
        originalYomu: boolean;
        externalDialogueUsed: boolean;
        fictionalComposite: boolean;
        realEventClaim: boolean;
    };
    readonly cast: readonly StoryCastUse[];
    readonly entry: {
        story: { after?: string; requiresSeen?: readonly string[]; forbidsAfterGraduation?: boolean };
        curriculum: {
            anyOfEvidence: readonly Record<string, unknown>[];
            recommendedBand: string;
            missingEvidenceRoute: string;
        };
    };
    readonly curriculumBinding?: {
        lessonId: string;
        contentVersion: string;
        contentSha256: string;
        provenancePath: string;
        provenanceSha256: string;
        sectionSequence: readonly string[];
        sourceSequence: readonly StorySourceAnchor[];
        missions: readonly StoryMission[];
    };
    readonly scenes: readonly StoryScene[];
    readonly callbacks: readonly {
        id: string;
        state: string;
        priorUse?: { packageId: string; state: string };
    }[];
    readonly replay: {
        chronologicalMemory: boolean;
        canonicalWrites: boolean;
        allowedLayers: readonly string[];
    };
}

interface LessonZeroData {
    readonly sourceLibrary: {
        readonly documents: readonly { id: string; sha256: string }[];
        readonly questions: readonly { id: string; documentId: string }[];
    };
    readonly lesson: {
        readonly id: string;
        readonly contentVersion: string;
        readonly sectionIds: readonly string[];
        readonly sections: readonly {
            id: string;
            order: number;
            activityIds: readonly string[];
            resumableAfter: boolean;
        }[];
        readonly activities: readonly {
            id: string;
            sectionId: string;
            sourceQuestionIds: readonly string[];
            responseMode: string;
        }[];
        readonly missions: readonly {
            id: string;
            hostIds: readonly string[];
            locationId: string;
            openingActivityId: string;
            transferActivityId: string;
            mementoId: string;
        }[];
    };
}

interface LessonZeroProvenance {
    readonly sequence: readonly {
        order: number;
        role: string;
        sourceSha256: string;
    }[];
}

function readJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function digest(filePath: string): string {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function allNodes(story: StoryPackage): StoryNode[] {
    return story.scenes.flatMap(scene => [...scene.nodes]);
}

function activityNodes(story: StoryPackage): StoryNode[] {
    return allNodes(story).filter(node => node.kind === 'activity');
}

function choiceNodes(story: StoryPackage): StoryNode[] {
    return allNodes(story).filter(node => node.kind === 'choice');
}

function authoredSceneText(story: StoryPackage): string {
    return story.scenes.flatMap(scene => scene.nodes.flatMap(node => [
        ...Object.values(node.variants ?? {}).flatMap(variant => [
            variant.japanese,
            variant.reading,
            variant.english,
        ]),
        ...(node.options ?? []).flatMap(option => [
            option.action,
            ...Object.values(option.japaneseByBand),
        ]),
    ])).join('\n');
}

function expectUnique(values: readonly string[], label: string): void {
    expect(new Set(values).size, `${label} must be unique`).toBe(values.length);
}

describe('opening story arc packages', () => {
    const arrival = readJson<StoryPackage>(ARRIVAL_PATH);
    const chapter = readJson<StoryPackage>(CHAPTER_PATH);
    const lesson = readJson<LessonZeroData>(LESSON_PATH);
    const provenance = readJson<LessonZeroProvenance>(PROVENANCE_PATH);

    it('forms one immutable original arc from the arrival bridge into canonical Chapter 1', () => {
        expect(arrival).toMatchObject({
            schema: 'yomu-academy.story-package.v2',
            id: 'bridge:opening-arrival',
            canonicality: 'bridge',
            season: 1,
        });
        expect(chapter).toMatchObject({
            schema: 'yomu-academy.story-package.v2',
            id: 's1e01-the-blank-atlas',
            canonicality: 'canon',
            season: 1,
            chapter: 1,
        });
        expect(chapter.entry.story).toMatchObject({
            after: arrival.id,
            requiresSeen: ['scene:opening-arrival:fiction-notice'],
            forbidsAfterGraduation: true,
        });
        expect(arrival.replay.canonicalWrites).toBe(false);
        expect(chapter.replay.canonicalWrites).toBe(false);

        for (const story of [arrival, chapter]) {
            expect(story.revision).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
            expect(story.sourceSafety).toEqual({
                originalYomu: true,
                externalDialogueUsed: false,
                fictionalComposite: true,
                realEventClaim: false,
            });
            expect(story.entry.curriculum).toMatchObject({
                recommendedBand: 'foundation',
            });
            expect(story.scenes.every(scene => scene.checkpointOnEnter && scene.exit.checkpoint)).toBe(true);
        }
    });

    it('keeps every graph reference reachable and every activity resumable', () => {
        for (const story of [arrival, chapter]) {
            const sceneIds = story.scenes.map(scene => scene.id);
            const nodes = allNodes(story);
            const nodeIds = nodes.map(node => node.id);
            const optionIds = choiceNodes(story).flatMap(node => node.options?.map(option => option.id) ?? []);
            const addressable = new Set([...sceneIds, ...nodeIds, ...optionIds]);

            expectUnique(sceneIds, `${story.id} scene ids`);
            expectUnique(nodeIds, `${story.id} node ids`);
            expectUnique(optionIds, `${story.id} option ids`);

            for (const scene of story.scenes) {
                if (scene.exit.next) {
                    expect(addressable.has(scene.exit.next), `${scene.id} exit ${scene.exit.next}`).toBe(true);
                }
            }
            for (const choice of choiceNodes(story)) {
                expect(choice.options?.length).toBeGreaterThanOrEqual(2);
                expect(addressable.has(choice.convergence ?? ''), `${choice.id} convergence`).toBe(true);
                for (const option of choice.options ?? []) {
                    expect(addressable.has(option.next), `${option.id} next`).toBe(true);
                    expect(Object.keys(option.japaneseByBand)).toContain('foundation');
                    expect(option.records).not.toHaveLength(0);
                }
            }
            for (const activity of activityNodes(story)) {
                expect(activity.resumeContext?.length).toBeGreaterThan(30);
                expect(activity.onReady).toMatch(/^checkpoint:/);
                expect(activity.onDefer).toMatch(/^checkpoint:/);
                expect(activity.onRepair).toMatch(/^node:/);
                expect(addressable.has(activity.onReady ?? ''), `${activity.id} ready`).toBe(true);
                expect(addressable.has(activity.onRepair ?? ''), `${activity.id} repair`).toBe(true);
                expect(addressable.has(activity.onDefer ?? ''), `${activity.id} defer`).toBe(true);
                expect(activity.requiredEvidence).toEqual({
                    kind: 'activity-passed',
                    activityId: activity.hook?.exerciseId,
                });
            }
            for (const conditional of nodes.filter(node => node.when)) {
                const choice = choiceNodes(story).find(node => node.id === conditional.when?.choiceId);
                const validOptions = new Set(choice?.options?.map(option => option.id));
                expect(choice, `${conditional.id} condition choice`).toBeDefined();
                if (conditional.when?.optionId) expect(validOptions.has(conditional.when.optionId)).toBe(true);
                for (const optionId of conditional.when?.optionIds ?? []) {
                    expect(validOptions.has(optionId)).toBe(true);
                }
            }
        }
    });

    it('pins the chapter to the exact current Lesson 0 and provenance revisions', () => {
        const binding = chapter.curriculumBinding;
        expect(binding).toBeDefined();
        expect(binding).toMatchObject({
            lessonId: lesson.lesson.id,
            contentVersion: lesson.lesson.contentVersion,
            contentSha256: digest(LESSON_PATH),
            provenancePath: 'public/academy/content/lessons/lesson-zero/provenance.v1.json',
            provenanceSha256: digest(PROVENANCE_PATH),
            sectionSequence: lesson.lesson.sectionIds,
        });
        expect(binding?.sourceSequence.map(anchor => ({
            order: anchor.order,
            role: anchor.role,
            sourceSha256: anchor.sourceSha256,
        }))).toEqual(provenance.sequence.map(anchor => ({
            order: anchor.order,
            role: anchor.role,
            sourceSha256: anchor.sourceSha256,
        })));
    });

    it('plays every Lesson 0 section in order and requests every registered activity exactly once', () => {
        const binding = chapter.curriculumBinding!;
        const curriculumScenes = chapter.scenes.filter(scene => scene.curriculum);
        const orderedSections = [...new Map(
            curriculumScenes
                .sort((left, right) => left.curriculum!.order - right.curriculum!.order)
                .map(scene => [scene.curriculum!.sectionId, scene.curriculum!.order]),
        ).keys()];
        expect(orderedSections).toEqual(lesson.lesson.sectionIds);
        expect(new Set(curriculumScenes.map(scene => scene.curriculum?.order))).toEqual(
            new Set(Array.from({ length: 9 }, (_, index) => index + 1)),
        );
        expect(lesson.lesson.sections.every(section => section.resumableAfter)).toBe(true);
        expect(binding.sectionSequence).toEqual(lesson.lesson.sectionIds);

        const hooks = activityNodes(chapter).map(node => node.hook!);
        expectUnique(hooks.map(hook => hook.exerciseId), 'opening arc activity hooks');
        expect(hooks.map(hook => hook.exerciseId).sort()).toEqual(
            lesson.lesson.activities.map(activity => activity.id).sort(),
        );
        expect(hooks.every(hook => hook.lessonId === lesson.lesson.id)).toBe(true);
        expect(hooks.every(hook => [
            'authentic-input', 'vocabulary', 'grammar', 'listening', 'reading',
            'speaking', 'writing', 'transfer',
        ].includes(hook.componentType))).toBe(true);
    });

    it('keeps Sound, Text, and Speaking distinct and reconverges them before common transfer and close', () => {
        const authoredMissions = chapter.curriculumBinding!.missions;
        expect(authoredMissions).toHaveLength(3);
        const canonicalMissions = lesson.lesson.missions.map(mission => ({
            id: mission.id,
            hostIds: mission.hostIds,
            locationId: mission.locationId,
            openingActivityId: mission.openingActivityId,
            transferActivityId: mission.transferActivityId,
            mementoId: mission.mementoId,
        }));
        expect(authoredMissions.map(mission => ({
            id: mission.id,
            hostIds: mission.hostIds,
            locationId: mission.locationId,
            openingActivityId: mission.openingActivityId,
            transferActivityId: mission.transferActivityId,
            mementoId: mission.mementoId,
        }))).toEqual(canonicalMissions);

        const missionChoice = choiceNodes(chapter).find(node => node.id === 'choice:blank-atlas:mission');
        expect(missionChoice?.options?.map(option => option.id)).toEqual(
            authoredMissions.map(mission => mission.choiceOptionId),
        );
        expect(missionChoice?.convergence).toBe('scene:blank-atlas:reading-writing');

        for (const mission of authoredMissions) {
            const scene = chapter.scenes.find(candidate => candidate.id === mission.sceneId);
            expect(scene?.locationId).toBe(mission.locationId);
            expect(scene?.curriculum).toMatchObject({
                sectionId: 'multi-speaker-input',
                order: 6,
                missionId: mission.id,
            });
            expect(scene?.exit.next).toBe('scene:blank-atlas:reading-writing');
            expect(scene?.nodes.filter(node => node.kind === 'line').map(node => node.speakerId).sort())
                .toEqual([...mission.hostIds].sort());
            expect(scene?.nodes.some(node => node.hook?.exerciseId === mission.openingActivityId)).toBe(true);
        }

        const transfer = chapter.scenes.find(scene => scene.id === 'scene:blank-atlas:transfer')!;
        for (const mission of authoredMissions) {
            const activity = transfer.nodes.find(
                node => node.hook?.exerciseId === mission.transferActivityId,
            );
            expect(activity?.when).toEqual({
                choiceId: 'choice:blank-atlas:mission',
                optionId: mission.choiceOptionId,
            });
        }
        expect(chapter.scenes.find(scene => scene.id === 'scene:blank-atlas:reading-writing')?.exit.next)
            .toBe('scene:blank-atlas:transfer');
        expect(transfer.exit.next).toBe('scene:blank-atlas:close');
    });

    it('covers all fourteen Moodle classroom expressions through the canonical activities', () => {
        const moodle = chapter.curriculumBinding!.sourceSequence.find(
            anchor => anchor.role === 'classroom-language',
        )!;
        const classroomDocument = lesson.sourceLibrary.documents.find(
            document => document.sha256 === moodle.sourceSha256,
        );
        const canonicalQuestions = lesson.sourceLibrary.questions
            .filter(question => question.documentId === classroomDocument?.id)
            .map(question => question.id)
            .sort();
        const canonicalActivities = lesson.lesson.activities.filter(
            activity => moodle.activityIds?.includes(activity.id),
        );

        expect(classroomDocument).toBeDefined();
        expect(canonicalQuestions).toHaveLength(14);
        expect(moodle.sourceQuestionIds?.slice().sort()).toEqual(canonicalQuestions);
        expect(canonicalActivities.flatMap(activity => activity.sourceQuestionIds).sort())
            .toEqual(canonicalQuestions);
        expect(moodle.policy).toContain('registered Moodle reconstruction owns prompts, answers, and grading');
    });

    it('uses the Genki greetings source only as a pinned teaching anchor', () => {
        const genki = chapter.curriculumBinding!.sourceSequence.find(
            anchor => anchor.role === 'greetings-reference-and-audio',
        )!;
        expect(genki).toMatchObject({
            order: 3,
            sourceSha256: '846cc2c9fc4d5310c8e6b3ee711817186239c3810e4433ec350015f32a4004b5',
            activityIds: ['activity:lesson-zero-greet-rie'],
        });
        expect(genki.policy).toBe(
            'Genki teaching anchor only; no textbook dialogue is stored in this package',
        );
        const greeting = allNodes(chapter).find(node => node.id === 'line:blank-atlas:rie-konbanwa');
        expect(greeting?.variants?.foundation.japanese).toBe('こんばんは。はじめまして。Rieです。');
        expect(activityNodes(chapter).find(node => node.hook?.exerciseId === 'activity:lesson-zero-greet-rie'))
            .toBeDefined();
    });

    it('keeps story commands separate from lesson truth and writes completion only after close evidence', () => {
        const allowedCommands = new Set([
            'story.seen',
            'story.completed',
            'bond.chapterCompleted',
            'callback.transitioned',
            'world.locationDiscovered',
            'journal.memoryUnlocked',
            'presentation.cue',
        ]);
        const commands = [arrival, chapter].flatMap(story => allNodes(story)
            .filter(node => node.kind === 'command')
            .map(node => node.command!));
        expect(commands.every(command => allowedCommands.has(command.type))).toBe(true);
        expect(commands.some(command => /lesson|activity|evidence/i.test(command.type))).toBe(false);

        const closeNodes = chapter.scenes.find(scene => scene.id === 'scene:blank-atlas:close')!.nodes;
        const closeEvidenceIndex = closeNodes.findIndex(
            node => node.id === 'checkpoint:blank-atlas:after-close-room',
        );
        const storyCompletionIndex = closeNodes.findIndex(
            node => node.command?.type === 'story.completed',
        );
        const bondCompletionIndex = closeNodes.findIndex(
            node => node.command?.type === 'bond.chapterCompleted',
        );
        expect(closeEvidenceIndex).toBeGreaterThan(0);
        expect(storyCompletionIndex).toBeGreaterThan(closeEvidenceIndex);
        expect(bondCompletionIndex).toBeGreaterThan(closeEvidenceIndex);
    });

    it('uses only eligible cast, name-only classmates, and bounded scene ensembles', () => {
        const registry = new Map<string, (typeof ACADEMY_CAST)[number]>(
            ACADEMY_CAST.map(member => [member.id, member]),
        );
        for (const story of [arrival, chapter]) {
            for (const use of story.cast) {
                const member = registry.get(use.castId);
                expect(member?.eligibility.story, use.castId).toBe(true);
                if (use.castId === 'rie') {
                    expect(use.portrayal).toBe('likeness-cleared');
                    expect(member?.eligibility.likenessRuntime).toBe(true);
                } else {
                    expect(use.portrayal).toBe('name-only');
                    expect(use.portraitAsset).toBeUndefined();
                    expect(member?.eligibility.lessons).toBe(true);
                    expect(member?.eligibility.likenessRuntime).toBe(false);
                }
            }

            const castIds = new Set(story.cast.map(use => use.castId));
            for (const scene of story.scenes) {
                const speakers = new Set(scene.nodes
                    .filter(node => node.kind === 'line')
                    .map(node => node.speakerId!));
                expect([...speakers].every(id => castIds.has(id))).toBe(true);
                expect([...speakers].filter(id => id !== 'rie').length).toBeLessThanOrEqual(2);
            }
        }
    });

    it('makes disclosure and recording choices non-coercive and safely resumable', () => {
        const sensitiveChoices = [
            'choice:blank-atlas:disclosure-scope',
            'choice:blank-atlas:speaking-recording',
            'choice:blank-atlas:transfer-recording',
        ].map(id => choiceNodes(chapter).find(node => node.id === id)!);
        for (const choice of sensitiveChoices) {
            expect(choice).toBeDefined();
            expect(choice.options?.every(option => option.records.includes('boundary-heard'))).toBe(true);
        }

        const speaking = sensitiveChoices[1]!;
        const transfer = sensitiveChoices[2]!;
        expect(speaking.options?.some(option => /pause|return/i.test(option.action))).toBe(true);
        expect(transfer.options?.some(option => /pause|return/i.test(option.action))).toBe(true);
        expect(speaking.options?.find(option => /pause/i.test(option.action))?.next)
            .toBe('checkpoint:blank-atlas:speaking-recording-deferred');
        expect(transfer.options?.find(option => /pause/i.test(option.action))?.next)
            .toBe('checkpoint:blank-atlas:transfer-recording-deferred');

        const text = authoredSceneText(chapter);
        expect(text).not.toMatch(/affection|romance|reward for sharing|must share|real name/i);
    });

    it('contains no game-script borrowing, reference-corpus path, or story-owned audio binding', () => {
        const sourceFiles = [ARRIVAL_PATH, CHAPTER_PATH].map(filePath => fs.readFileSync(filePath, 'utf8'));
        const sourceText = sourceFiles.join('\n');
        const sceneText = [arrival, chapter].map(authoredSceneText).join('\n');

        expect(sourceText).not.toMatch(
            /references-academy\/game-scripts|\bPokemon\b|\bPokémon\b|\bPersona\b|\bGameFAQs\b|\bpokered\b/i,
        );
        expect(sceneText).not.toMatch(
            /\bPikachu\b|\bPokémon\b|\bPersona\b|\bPhantom Thief\b|\bVelvet Room\b|\bSocial Link\b|\bConfidant\b/i,
        );
        expect(sourceText).not.toMatch(/"audio"\s*:|"audioBinding"\s*:|"audioAsset"\s*:/i);
        expect(sourceText).not.toMatch(/"browserTtsAllowed"\s*:|"runtimeUrl"\s*:/i);
        expect([arrival, chapter].every(story => story.sourceSafety.externalDialogueUsed === false)).toBe(true);
    });

    it('seeds the open-chair and first-lantern callbacks without replay writes', () => {
        expect(arrival.callbacks).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'callback:open-chair', state: 'seed' }),
        ]));
        expect(chapter.callbacks).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'callback:open-chair',
                state: 'echo',
                priorUse: { packageId: arrival.id, state: 'seed' },
            }),
            expect.objectContaining({ id: 'callback:first-lantern', state: 'seed' }),
        ]));
        expect(arrival.replay.canonicalWrites).toBe(false);
        expect(chapter.replay.canonicalWrites).toBe(false);
    });
});
