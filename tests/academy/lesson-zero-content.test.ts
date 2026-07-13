import fs from 'node:fs';
import path from 'node:path';
import {
    LESSON_ZERO_CANONICAL_CHARACTER_IDS,
    LESSON_ZERO_CONTENT_URL,
    LESSON_ZERO_RESPONSE_MODES,
    loadLessonZeroContent,
    validateLessonZeroPackage,
} from '../../src/academy/content/lesson-zero';
import { ACADEMY_CAST } from '../../src/academy/domain/cast-registry';

const CONTENT_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function packageJson(): unknown {
    return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
}

function lessonFetcher(): typeof fetch {
    return vi.fn(async (value: string | URL | Request) => {
        expect(String(value)).toBe(LESSON_ZERO_CONTENT_URL);
        return new Response(fs.readFileSync(CONTENT_PATH), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
}

describe('complete Lesson 0 content package', () => {
    it('is a full 60–90 minute foundation class rather than the fourteen-item handout alone', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());

        expect(lesson.estimatedMinutes).toEqual({ minimum: 60, maximum: 90 });
        expect(lesson.sectionIds).toEqual([
            'arrival-greetings',
            'sound-script-map',
            'classroom-survival',
            'sentence-frames',
            'useful-vocabulary',
            'multi-speaker-input',
            'reading-writing',
            'transfer',
            'close',
        ]);
        expect(lesson.sections.every(section => section.resumableAfter)).toBe(true);
        expect(lesson.sentenceFrames).toEqual([
            'N は N です',
            'N は N じゃありません',
            'N は N ですか',
            'N の N',
            'N も N です',
        ]);
        expect(lesson.vocabulary.map(item => item.japanese)).toEqual(expect.arrayContaining([
            'こんばんは', 'はじめまして', 'よろしくお願いします', 'わたし', 'なまえ',
            '先生', '学生', '日本語', '英語', '人', 'クラス', 'くに', 'しごと',
        ]));
        expect(lesson.inputScripts).toHaveLength(3);
        expect(lesson.inputScripts.every(script => new Set(script.lines.map(line => line.speakerId)).size >= 2)).toBe(true);
    });

    it('gives the lesson overview concrete goals, people, places, and honest materials', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());

        expect(lesson.overview.title).toEqual({ en: 'Lesson 0', ja: 'レッスン0' });
        expect(lesson.overview.goals).toHaveLength(5);
        expect(lesson.overview.peopleIds).toEqual([
            'rie', 'xingyu', 'mika', 'sophie', 'ruparna', 'aakash', 'sam',
        ]);
        expect(lesson.overview.locationIds).toEqual([
            'location:classroom', 'location:language-lab', 'location:library', 'location:classroom-entrance',
        ]);
        const handout = lesson.overview.materials.find(material => material.kind === 'source-handout');
        expect(handout?.state).toBe('ready');
        expect(handout?.sourceQuestionIds).toHaveLength(14);
        const dialogue = lesson.overview.materials.find(material => material.kind === 'dialogue-audio');
        expect(dialogue).toMatchObject({
            state: 'release-blocked',
            blockerId: 'blocker:lesson-zero-verified-dialogue-audio',
        });
    });

    it('preserves all fourteen immutable source records with the audited document and page loci', async () => {
        const { sourceLibrary, lesson } = await loadLessonZeroContent(lessonFetcher());
        const questions = [];
        for await (const question of sourceLibrary.questionsForOccurrence('occurrence:ucl-2023-l1-lesson-1')) {
            questions.push(question);
        }

        expect(questions).toHaveLength(14);
        for (let number = 1; number <= 14; number += 1) {
            const question = questions.find(candidate => candidate.locus.printedNumber === String(number));
            expect(question, `source record ${number}`).toBeDefined();
            expect(question?.id).toBe(`source-question:classroom-phrase-${String(number).padStart(2, '0')}`);
            expect(question?.locus.page).toBe(number <= 8 ? 1 : 2);
        }

        const item8 = await sourceLibrary.getQuestion('source-question:classroom-phrase-08');
        const item11 = await sourceLibrary.getQuestion('source-question:classroom-phrase-11');
        const document = await sourceLibrary.getDocument(item8.documentId);
        expect(document.sha256).toBe('1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba');
        expect(item8.prompt.ja).toContain('はい、わかります');
        expect(item8.prompt.ja).toContain('いいえ、わかりません');
        expect(item11.prompt.ja).toContain('そうです／あってます');

        const sourceUse = new Set(lesson.activities.flatMap(activity => activity.sourceQuestionIds));
        expect([...sourceUse].sort()).toEqual(questions.map(question => question.id).sort());
    });

    it('uses only the canonical Lesson 0 cast and the exact route hosts', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());
        const exactFirstNames = new Map([
            ['xingyu', 'Xingyu'], ['mika', 'Mika'], ['sophie', 'Sophie'],
            ['ruparna', 'Ruparna'], ['aakash', 'Aakash'], ['sam', 'Sam'],
        ]);
        const usedCharacters = new Set([
            ...lesson.inputScripts.flatMap(script => script.lines.map(line => line.speakerId)),
            ...lesson.missions.flatMap(mission => mission.hostIds),
        ]);
        expect(LESSON_ZERO_CANONICAL_CHARACTER_IDS).toEqual(ACADEMY_CAST.map(member => member.id));
        expect([...usedCharacters].every(id => LESSON_ZERO_CANONICAL_CHARACTER_IDS.includes(id))).toBe(true);
        expect(lesson.missions.map(mission => [mission.id, ...mission.hostIds])).toEqual([
            ['sound', 'xingyu', 'mika'],
            ['text', 'sophie', 'ruparna'],
            ['speaking', 'aakash', 'sam'],
        ]);
        expect(lesson.missions.find(mission => mission.id === 'sound')?.locationId)
            .toBe('location:language-lab');
        for (const line of lesson.inputScripts.flatMap(script => script.lines)) {
            const firstName = exactFirstNames.get(line.speakerId);
            expect(firstName, `confirmed Latin name for ${line.speakerId}`).toBeDefined();
            expect(line.japanese).toContain(firstName);
            expect(line.reading).toContain(firstName);
        }
    });

    it('rejects a speaker outside the canonical cast registry', () => {
        const candidate = packageJson() as {
            lesson: { inputScripts: Array<{ lines: Array<{ speakerId: string }> }> };
        };
        candidate.lesson.inputScripts[0]!.lines[0]!.speakerId = 'invented-classmate';
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/invents cast id invented-classmate/i);
    });

    it('does not infer occupations or nationalities for Lesson 0 hosts', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());
        const authoredDialogue = lesson.inputScripts
            .flatMap(script => script.lines.flatMap(line => [line.japanese, line.english]))
            .join('\n');

        expect(authoredDialogue).not.toMatch(
            /エンジニア|会社員|かいしゃいん|日本人|インド人|イギリス人|アメリカ人|カナダ人|engineer|company employee|occupation|nationality|Indian|British|American|Canadian/iu,
        );
        expect(authoredDialogue).not.toContain('日本語の学生です');
        expect(authoredDialogue).not.toMatch(/Samさんは先生ですか|先生じゃありません|are you the teacher|not the teacher/iu);
        for (const line of lesson.inputScripts.flatMap(script => script.lines)) {
            expect(line.japanese).toContain('日本語を勉強しています');
        }
        const speaking = lesson.inputScripts.find(script => script.id === 'input:lesson-zero-speaking-hosts');
        expect(speaking?.lines.find(line => line.speakerId === 'aakash')?.japanese).toContain('これは教科書ですか');
        expect(speaking?.lines.find(line => line.speakerId === 'sam')?.japanese).toContain('教科書じゃありません。プリントです');
    });

    it('makes Sound, Text, and Speaking structurally distinct missions', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());
        expect(new Set(lesson.missions.map(mission => mission.locationId)).size).toBe(3);
        expect(new Set(lesson.missions.map(mission => mission.signature)).size).toBe(3);
        expect(new Set(lesson.missions.map(mission => mission.mementoId)).size).toBe(3);
        expect(new Set(lesson.missions.map(mission => JSON.stringify(mission.evidenceProfile))).size).toBe(3);

        const activityById = new Map(lesson.activities.map(activity => [activity.id, activity]));
        expect(activityById.get(lesson.missions[0]!.openingActivityId)?.responseMode).toBe('listen');
        expect(activityById.get(lesson.missions[1]!.openingActivityId)?.responseMode).toBe('reconstruct');
        expect(activityById.get(lesson.missions[2]!.openingActivityId)?.responseMode).toBe('voice');
    });

    it('never gives assessed English, transcripts, or model answers before commitment', async () => {
        const { lesson, sourceLibrary } = await loadLessonZeroContent(lessonFetcher());
        const assessed = lesson.activities.filter(activity => activity.assessed);

        expect(assessed).not.toHaveLength(0);
        for (const activity of assessed) {
            expect(activity.support).toEqual({
                reading: 'learner-controlled',
                pitch: 'learner-controlled',
                englishMeaning: 'after-commit',
                transcript: 'after-commit',
                modelAnswer: 'after-first-attempt',
            });
            expect(activity.responseMode).not.toBe('choice');
        }
        expect(lesson.inputScripts.every(script => script.transcriptReveal === 'after-commit')).toBe(true);

        // Source meaning remains immutable and teacher-verifiable; the activity contract gates it.
        expect((await sourceLibrary.getQuestion('source-question:classroom-phrase-09')).prompt.en)
            .toBe('Once more/again (Please).');
    });

    it('collects listen, action, reconstruction, voice, IME, and real Doodle evidence', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());
        expect(new Set(lesson.activities.map(activity => activity.responseMode)))
            .toEqual(new Set(LESSON_ZERO_RESPONSE_MODES));

        const productionModes = new Set(
            lesson.activities.filter(activity => activity.production).map(activity => activity.responseMode),
        );
        expect([...productionModes]).toEqual(expect.arrayContaining(['act', 'reconstruct', 'voice', 'ime', 'doodle']));
        const transfer = lesson.activities.filter(activity => activity.sectionId === 'transfer' && activity.production);
        expect(transfer.some(activity => activity.responseMode === 'voice')).toBe(true);
        expect(transfer.some(activity => activity.responseMode === 'ime')).toBe(true);
        expect(lesson.activities.find(activity => activity.responseMode === 'doodle')?.expectedEvidence.values)
            .toEqual(['あ', 'い', 'う', 'え', 'お']);
    });

    it('keeps unverified dialogue audio as an internal release blocker and forbids browser TTS', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());

        expect(lesson.audioAssets).toHaveLength(3);
        for (const asset of lesson.audioAssets) {
            expect(asset).toMatchObject({
                state: 'release-blocked',
                browserTtsAllowed: false,
                learnerVisiblePlaceholder: false,
                blockerId: 'blocker:lesson-zero-verified-dialogue-audio',
            });
            expect(asset.runtimeUrl).toBeUndefined();
        }
        expect(lesson.releaseBlockers).toEqual([
            expect.objectContaining({
                kind: 'audio',
                learnerVisible: false,
                assetIds: lesson.audioAssets.map(asset => asset.id),
            }),
        ]);
    });

    it('rejects dishonest audio fallback state at the package boundary', () => {
        const candidate = packageJson() as {
            lesson: { audioAssets: Array<{ browserTtsAllowed: boolean }> };
        };
        candidate.lesson.audioAssets[0]!.browserTtsAllowed = true;
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/fake or learner-visible fallback/i);
    });

    it('rejects overview material that is detached from the authored lesson', () => {
        const candidate = packageJson() as {
            lesson: { overview: { materials: Array<{ activityIds: string[] }> } };
        };
        candidate.lesson.overview.materials[0]!.activityIds = ['activity:invented'];
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/references unknown activity/i);
    });
});
