import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyListeningHingeBeat } from '../../src/academy/content/lesson-thirty-listening-hinge';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type ListeningHingeModel } from '../../src/academy/minigames';

function model(): ListeningHingeModel { return createLessonThirtyListeningHingeBeat().activity as ListeningHingeModel; }

afterEach(() => document.body.replaceChildren());

describe('Lesson 30 Sensei B-24 listening hinge', () => {
    it('teaches exact Sensei vocabulary and B-24 pages before reviewed original audio', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l05-sensei-b24-listening-hinge', kind: 'academy-listening-hinge', responseKind: 'moodle-b24-listening-hinge',
            provenance: {
                packageId: 'l2-l05', moodle: {
                    moduleId: 6974651,
                    audio: { payloadSha256: 'f39560e74390378765a07f94dd19d1d4f0595935dbef04ffebcf37b10e485df2', durationSeconds: 82.56 },
                    vocabularySheet: { sha256: '0981cc1579d4cde558ecec3f68dc385e72cc50a09fee38c7d54e36aa1edd6e5c' },
                    listeningSheet: { sha256: 'f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975' },
                },
                support: { minna: { reference: 'Minna no Nihongo I, Lesson 20' }, genki: { payloadSha256: '510418850a44517faf16d384412b5cc90f653bfe7426063cdf616723d4c62f55' } },
            },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual(['よかったら　いろいろ　ぼく　うん　ううん', '〜ます / 〜ません']);
        expect(activity.payload.prompts.map(prompt => [prompt.sourceOrder, prompt.correctOptionId])).toEqual([[1, 'left'], [2, 'right'], [3, 'right']]);
    });

    it('requires all B-24 hinges and repairs only missed choices', () => {
        const activity = model(); const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, { answers: activity.payload.prompts.map(prompt => ({ promptId: prompt.id, optionId: prompt.correctOptionId })) });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(['日曜日 花見に 行きます。', '料理を 手伝いません。', 'パン屋へ 行きます。']);
        const repair = runtime.evaluate(activity, { answers: activity.payload.prompts.map((prompt, index) => ({ promptId: prompt.id, optionId: index === 1 ? 'left' : prompt.correctOptionId })) });
        expect(repair.result).toMatchObject({ outcome: 'lapse', score: 2 / 3, errorTags: ['l2-l05-b24-cooking'] });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b24-listening-hinge:hinge-2']);
    });

    it('keeps answers hidden until an attempt and mounts source pages before original B-24', async () => {
        const host = document.createElement('main'); const onEvaluation = vi.fn();
        const controller = createAcademyActivityRuntime().mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, onEvaluation); document.body.append(host);
        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!; const sources = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!; const audio = host.querySelector<HTMLAudioElement>('audio')!; const form = host.querySelector<HTMLFormElement>('form')!; const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); expect(sources.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); expect(audio.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect([...sources.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual(['/academy/content/lessons/l2-l05/moodle-chapter-20-2-vocabulary-page-1.png', '/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png']);
        expect(audio.getAttribute('src')).toBe('/academy/content/lessons/l2-l05/moodle-b-24.mp3'); expect(key.hidden).toBe(true); expect(form.textContent).toContain('Left'); expect(form.textContent).not.toContain('花見');
        model().payload.prompts.forEach(prompt => host.querySelector<HTMLInputElement>(`input[value="${prompt.correctOptionId}"][name$=":${prompt.id}"]`)!.click()); form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce()); await vi.waitFor(() => expect(key.hidden).toBe(false)); expect(key.textContent).toContain('料理を 手伝いません'); controller.dispose();
    });

    it('keeps source bytes, delivery, ledger, and Alex and Tom chapter reachable offline', async () => {
        const activity = model();
        ([
            ['moodle-chapter-20-2-vocabulary-page-1.png', activity.provenance.moodle.vocabularySheet.sha256],
            ['moodle-chapter-20-listening-page-1.png', activity.provenance.moodle.listeningSheet.sha256],
            ['moodle-b-24.mp3', activity.provenance.moodle.audio.payloadSha256],
        ] as const).forEach(([file, sha256]) => expect(createHash('sha256').update(readFileSync(path.resolve('public/academy/content/lessons/l2-l05', file))).digest('hex')).toBe(sha256));
        const chapter = await loadLessonActivityChapter('l2-l05', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l2-l05',
            host: { id: 'alex' },
            beats: [
                { id: 'sensei-b24-listening-hinge', activity: { kind: 'academy-listening-hinge' } },
                { id: 'sensei-b25-diary-listening', activity: { kind: 'academy-diary-listening-cloze' } },
                { id: 'sensei-minna-069-conversation', activity: { kind: 'academy-conversation-listening-check' } },
            ],
        });
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as { worksheetDigitisation: { additionalSlices: Array<{ lessonId: string; audio: { status: string }; claims: Record<string, number> }> } };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l05')).toMatchObject({
            audio: { status: 'original-moodle-b24-b25-and-minna-069-paired-and-reviewed' },
            claims: {
                sourceAudioChoicePromptsDelivered: 3,
                sourceAudioClozePromptsDelivered: 3,
                sourceAudioClozeBlanksDelivered: 5,
                sourceAudioConversationPromptsDelivered: 5,
                originalAudioTracksDelivered: 3,
                sourceAnswerKeysExposed: 0,
            },
        });
        const worker = readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8');
        ['/academy/content/lessons/l2-l05/moodle-chapter-20-2-vocabulary-page-1.png', '/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png', '/academy/content/lessons/l2-l05/moodle-b-24.mp3'].forEach(asset => expect(worker).toContain(`'${asset}'`));
    });
});
