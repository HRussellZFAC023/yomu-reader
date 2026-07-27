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
        expect(lesson.inputScripts).toHaveLength(4);
        expect(lesson.inputScripts.filter(script => script.kind === 'dialogue')
            .every(script => new Set(script.lines.map(line => line.speakerId)).size >= 2)).toBe(true);
        const vowelRow = lesson.inputScripts.find(script => script.id === 'input:lesson-zero-vowel-row');
        expect(vowelRow).toMatchObject({
            kind: 'sound-sequence',
            audioAssetId: 'audio:lesson-zero-vowel-row',
            lines: [{ japanese: 'あ・い・う・え・お' }],
        });
    });

    it('gives the lesson overview concrete goals, people, places, and honest materials', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());

        expect(lesson.overview.title).toEqual({ en: 'Lesson 0', ja: 'レッスン0' });
        expect(lesson.overview.goals).toHaveLength(6);
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
            state: 'ready',
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
        const exactWrittenNames = new Map([
            ['xingyu', 'シンユ'], ['mika', 'ミカ'], ['sophie', 'Sophie'],
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
        for (const { script, speakerId } of dialogueSpeakerEntries(lesson)) {
            const firstName = exactWrittenNames.get(speakerId);
            const speakerLines = script.lines.filter(line => line.speakerId === speakerId);
            expect(firstName, `canonical written name for ${speakerId}`).toBeDefined();
            expect(speakerLines.some(line => line.japanese.includes(firstName!))).toBe(true);
            expect(speakerLines.some(line => line.reading.includes(firstName!))).toBe(true);
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
        for (const { script, speakerId } of dialogueSpeakerEntries(lesson)
            .filter(entry => entry.script.id !== 'input:lesson-zero-sound-hosts')) {
            expect(script.lines.some(line =>
                line.speakerId === speakerId && line.japanese.includes('日本語を勉強しています'))).toBe(true);
        }
        const sound = lesson.inputScripts.find(script => script.id === 'input:lesson-zero-sound-hosts');
        expect(sound?.lines.map(line => line.japanese)).toEqual([
            'はじめまして。シンユです。',
            'ミカです。よろしくお願いします。',
            'こちらはシンユさんです。',
            'こちらはミカさんです。',
        ]);
        const speaking = lesson.inputScripts.find(script => script.id === 'input:lesson-zero-speaking-hosts');
        expect(speaking?.lines.find(line => line.speakerId === 'aakash')?.japanese).toContain('これは教科書ですか');
        expect(speaking?.lines.find(line => line.speakerId === 'sam')?.japanese).toContain('教科書じゃありません。プリントです');
        expect(speaking?.lines.find(line => line.id === 'line:lesson-zero-speaking-aakash-cue')?.japanese)
            .toBe('では、あなたの番です。お名前は何ですか。');
        expect(speaking?.learnerTurns).toEqual([
            expect.objectContaining({
                afterLineId: 'line:lesson-zero-speaking-aakash-cue',
                capture: {
                    kind: 'microphone-recording',
                    windowMs: 12000,
                    evidenceKind: 'spoken-turn',
                },
            }),
        ]);
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

    it('exposes every aggregate and split line only after verified pairing', async () => {
        const { lesson } = await loadLessonZeroContent(lessonFetcher());

        expect(lesson.audioAssets).toHaveLength(13);
        const readyAssets = lesson.audioAssets.filter(asset => asset.state === 'ready');
        expect(readyAssets).toHaveLength(13);
        expect(readyAssets.map(asset => asset.id)).toEqual(expect.arrayContaining([
            'audio:lesson-zero-vowel-row',
            'audio:lesson-zero-sound-hosts',
            'audio:lesson-zero-sound-xingyu',
            'audio:lesson-zero-sound-mika',
            'audio:lesson-zero-sound-mika-names-xingyu',
            'audio:lesson-zero-sound-xingyu-names-mika',
            'audio:lesson-zero-text-hosts',
            'audio:lesson-zero-text-sophie',
            'audio:lesson-zero-text-ruparna',
            'audio:lesson-zero-speaking-hosts',
            'audio:lesson-zero-speaking-aakash-introduction',
            'audio:lesson-zero-speaking-sam',
            'audio:lesson-zero-speaking-aakash-cue',
        ]));
        expect(readyAssets.every(asset => asset.runtimeUrl?.endsWith('.opus'))).toBe(true);
        expect(readyAssets.every(asset => asset.verifiedPairing === true)).toBe(true);
        expect(readyAssets.every(asset => asset.browserTtsAllowed === false)).toBe(true);
        expect(readyAssets.every(asset => asset.learnerVisiblePlaceholder === false)).toBe(true);
        for (const asset of readyAssets) {
            const relative = asset.runtimeUrl!.replace(/^\/academy\//u, 'academy/');
            const publicFile = path.resolve('public', relative);
            const deployedFile = path.resolve('docs/public', relative);
            expect(fs.existsSync(publicFile), `${asset.id} is missing its public audio`).toBe(true);
            expect(fs.existsSync(deployedFile), `${asset.id} is missing its deployed audio`).toBe(true);
            expect(fs.readFileSync(deployedFile).equals(fs.readFileSync(publicFile))).toBe(true);
        }
        expect(lesson.releaseBlockers).toEqual([]);
    });

    it('rejects dishonest audio fallback state at the package boundary', () => {
        const candidate = packageJson() as {
            lesson: { audioAssets: Array<{ browserTtsAllowed: boolean }> };
        };
        candidate.lesson.audioAssets[0]!.browserTtsAllowed = true;
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/fake or learner-visible fallback/i);
    });

    it('rejects a vowel activity that is detached from the exact sound sequence', () => {
        const candidate = packageJson() as {
            lesson: {
                activities: Array<{ id: string; inputScriptId?: string }>;
                inputScripts: Array<{ id: string; lines: Array<{ japanese: string }> }>;
            };
        };
        const activity = candidate.lesson.activities.find(item => item.id === 'activity:lesson-zero-vowel-listen')!;
        activity.inputScriptId = 'input:lesson-zero-sound-hosts';
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/own sound-sequence script/i);

        const sequence = candidate.lesson.inputScripts.find(script => script.id === 'input:lesson-zero-vowel-row')!;
        activity.inputScriptId = sequence.id;
        sequence.lines[0]!.japanese = 'あ・い・え・う・お';
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/exact ordered vowel row/i);
    });

    it('rejects dangling or fake learner speaking turns', () => {
        const candidate = packageJson() as {
            lesson: {
                inputScripts: Array<{
                    id: string;
                    learnerTurns?: Array<{
                        afterLineId: string;
                        capture: { windowMs: number };
                    }>;
                }>;
            };
        };
        const speaking = candidate.lesson.inputScripts.find(script => script.id === 'input:lesson-zero-speaking-hosts')!;
        speaking.learnerTurns![0]!.afterLineId = 'line:missing';
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/references unknown line/i);

        const invalidWindow = packageJson() as typeof candidate;
        const invalidSpeaking = invalidWindow.lesson.inputScripts
            .find(script => script.id === 'input:lesson-zero-speaking-hosts')!;
        invalidSpeaking.learnerTurns![0]!.capture.windowMs = 0;
        expect(() => validateLessonZeroPackage(invalidWindow)).toThrow(/invalid capture window/i);

        const absent = packageJson() as typeof candidate;
        delete absent.lesson.inputScripts.find(script =>
            script.id === 'input:lesson-zero-speaking-hosts')!.learnerTurns;
        expect(() => validateLessonZeroPackage(absent)).toThrow(/no authored learner speaking turn/i);
    });

    it('validates learner support by contract rather than JSON key order', () => {
        const candidate = packageJson() as {
            lesson: {
                inputScripts: Array<{
                    id: string;
                    learnerTurns?: Array<{
                        support: {
                            reading: string;
                            pitch: string;
                            englishMeaning: string;
                            transcript: string;
                            modelAnswer: string;
                        };
                    }>;
                }>;
            };
        };
        const turn = candidate.lesson.inputScripts.find(script =>
            script.id === 'input:lesson-zero-speaking-hosts')!.learnerTurns![0]!;
        const support = turn.support;
        turn.support = {
            modelAnswer: support.modelAnswer,
            transcript: support.transcript,
            englishMeaning: support.englishMeaning,
            pitch: support.pitch,
            reading: support.reading,
        };
        expect(() => validateLessonZeroPackage(candidate)).not.toThrow();
    });

    it('still requires every dialogue speaker to be named canonically once', () => {
        const candidate = packageJson() as {
            lesson: {
                inputScripts: Array<{
                    id: string;
                    lines: Array<{ speakerId: string; japanese: string; reading: string }>;
                }>;
            };
        };
        const speaking = candidate.lesson.inputScripts.find(script => script.id === 'input:lesson-zero-speaking-hosts')!;
        for (const line of speaking.lines.filter(item => item.speakerId === 'aakash')) {
            line.japanese = line.japanese.replace('Aakashです', 'わたしです');
            line.reading = line.reading.replace('Aakashです', 'わたしです');
        }
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/canonical first name Aakash/i);
    });

    it('rejects overview material that is detached from the authored lesson', () => {
        const candidate = packageJson() as {
            lesson: { overview: { materials: Array<{ activityIds: string[] }> } };
        };
        candidate.lesson.overview.materials[0]!.activityIds = ['activity:invented'];
        expect(() => validateLessonZeroPackage(candidate)).toThrow(/references unknown activity/i);
    });
});

type LessonZero = Awaited<ReturnType<typeof loadLessonZeroContent>>['lesson'];

function dialogueSpeakerEntries(lesson: LessonZero) {
    return lesson.inputScripts
        .filter(script => script.kind === 'dialogue')
        .flatMap(script => [...new Set(script.lines.map(line => line.speakerId))]
            .map(speakerId => ({ script, speakerId })));
}
