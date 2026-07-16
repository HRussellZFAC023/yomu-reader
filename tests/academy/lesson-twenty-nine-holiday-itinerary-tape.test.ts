import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonTwentyNineHolidayItineraryTapeBeat } from '../../src/academy/content/lesson-twenty-nine-holiday-itinerary-tape';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type HolidayItineraryTapeModel } from '../../src/academy/minigames';

function model(): HolidayItineraryTapeModel {
    return createLessonTwentyNineHolidayItineraryTapeBeat().activity as HolidayItineraryTapeModel;
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 29 Sensei B-22 holiday itinerary tape', () => {
    it('places the exact Sensei vocabulary and summer-holiday pages before reviewed B-22 audio', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l03-sensei-holiday-itinerary-tape',
            kind: 'academy-holiday-itinerary-tape',
            responseKind: 'moodle-b22-holiday-itinerary-tape',
            provenance: {
                moodle: {
                    moduleId: 7011919,
                    audio: { payloadSha256: '6dccd9517dc4e10fb1ce3548de2c3c9d07a498f12bbf6e5b734b0e56c1490e6b', durationSeconds: 45.093333 },
                    vocabularySheet: { sha256: 'edaa7f991771ccda7ff2a2a00ebffb5418234df2e0cd536c059cce532f38119e' },
                    grammarSheet: { sha256: '20595904296d510ed9aab10a13148c8d0c9d85e27779a637ac9cb5949dccf738' },
                },
                support: { minna: { reference: 'Minna no Nihongo I, Lesson 19' }, genki: { payloadSha256: 'c60448dea49bb12806d091d10b21890c040d2778d4df20283790e7e2c7ca2aee' } },
            },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'そうじします　せんたくします　れんしゅうします　やすみ の ひ　もうすぐ',
            'Vた り、Vた り します',
        ]);
        expect(activity.payload.pins.map(pin => [pin.sourceOrder, pin.correctSpeakerId])).toEqual([
            [1, 'speaker-a'], [2, 'speaker-a'], [3, 'speaker-b'], [4, 'speaker-b'],
        ]);
    });

    it('requires all four reviewed speaker pins and repairs only missed pins', () => {
        const activity = model(); const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, { answers: activity.payload.pins.map(pin => ({ pinId: pin.id, speakerId: pin.correctSpeakerId })) });
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual([
            '山田さん: 八月に一週間ぐらいあり、両親のうちへ帰ります。',
            '山田さん: 子どもと釣りに行ったり、山に登ったりします。',
            'クララさん: 九月に家族とインドネシアのバリへ行き、三週間ゆっくり休みます。',
            'クララさん: 海で泳いだり、本を読んだりしたいです。',
        ]);
        const repair = runtime.evaluate(activity, { answers: activity.payload.pins.map((pin, index) => ({ pinId: pin.id, speakerId: index === 2 ? 'speaker-a' : pin.correctSpeakerId })) });
        expect(repair.result).toMatchObject({ outcome: 'lapse', score: 3 / 4, errorTags: ['l2-l03-b22-clara-plan'] });
        expect(repair.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:7011919:17ddaf6b68bcddc8253ca398ae0c7c8015554160fb50f7cd5b7af50b136d6b5a:pdf-p3:summer-holiday:b22:pin-3']);
    });

    it('keeps answers hidden until an attempt and mounts the source pages before B-22', async () => {
        const host = document.createElement('main'); const onEvaluation = vi.fn();
        const controller = createAcademyActivityRuntime().mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, onEvaluation);
        document.body.append(host);
        const teaching = host.querySelector<HTMLElement>('[data-lesson-phase="teaching"]')!;
        const sources = host.querySelector<HTMLElement>('.academy-holiday-tape-sources')!;
        const audio = host.querySelector<HTMLAudioElement>('audio')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const answerKey = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(audio.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect([...sources.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual([
            '/academy/content/lessons/l2-l03/moodle-chapter-19-2-3-vocabulary-page-1.png',
            '/academy/content/lessons/l2-l03/moodle-chapter-19-2-tari-grammar-page-3.png',
        ]);
        expect(audio.getAttribute('src')).toBe('/academy/content/listening/media/academy-listening-6dccd9517dc4e10f.mp3');
        expect(answerKey.hidden).toBe(true);
        model().payload.pins.forEach(pin => host.querySelector<HTMLInputElement>(`input[value="${pin.correctSpeakerId}"][name$=":${pin.id}"]`)!.click());
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(answerKey.hidden).toBe(false));
        expect(answerKey.textContent).toContain('山田さん');
        expect(answerKey.textContent).toContain('今年の夏休みはどうですか。');
        controller.dispose();
    });

    it('keeps source bytes, delivery, and Jodi and Alex’s lesson chapter reachable', async () => {
        const activity = model();
        ([
            ['moodle-chapter-19-2-3-vocabulary-page-1.png', activity.provenance.moodle.vocabularySheet.sha256],
            ['moodle-chapter-19-2-tari-grammar-page-3.png', activity.provenance.moodle.grammarSheet.sha256],
            ['moodle-b-22.mp3', activity.provenance.moodle.audio.payloadSha256],
        ] as const).forEach(([file, sha256]) => expect(createHash('sha256').update(readFileSync(path.resolve('public/academy/content/lessons/l2-l03', file))).digest('hex')).toBe(sha256));
        const chapter = await loadLessonActivityChapter('l2-l03', { lookup: async () => null });
        expect(chapter).toMatchObject({ lessonPackageId: 'l2-l03', host: { id: 'jodi' }, beats: [{ id: 'sensei-holiday-itinerary-tape', activity: { kind: 'academy-holiday-itinerary-tape' } }] });
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as { worksheetDigitisation: { additionalSlices: Array<{ lessonId: string; audio: { status: string }; claims: Record<string, number> }> } };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l03')).toMatchObject({ audio: { status: 'original-moodle-b22-paired-and-reviewed' }, claims: { sourceAudioChoicePromptsDelivered: 4, originalAudioTracksDelivered: 1, sourceAnswerKeysExposed: 0 } });
    });
});
