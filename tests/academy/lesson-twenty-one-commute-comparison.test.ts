import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLessonTwentyOneCommuteComparisonBeat } from '../../src/academy/content/lesson-twenty-one-commute-comparison';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { commuteComparisonLogPlugin, createAcademyActivityRuntime, type CommuteComparisonLogModel } from '../../src/academy/minigames';

function model(): CommuteComparisonLogModel {
    return createLessonTwentyOneCommuteComparisonBeat().activity as CommuteComparisonLogModel;
}

describe('Lesson 21 Sensei commute comparison log', () => {
    it('puts the exact Chapter 11-4 route frame before all three disruption/usual prompts', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l1-l21-sensei-commute-comparison-log',
            provenance: {
                packageId: 'l1-l21',
                moodle: {
                    moduleId: 6375062,
                    worksheet: { payloadSha256: '49468890a807f485a2c86cf2c05f6c3e11b6e2bf0cbd2ca50da662de8b91e5f5', pages: [1, 3] },
                    audio: {
                        payloadSha256: '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97',
                        url: '/academy/content/listening/media/academy-listening-4f292de0dd3a5791.mp3',
                        transcriptStatus: 'worksheet-script-after-attempt',
                    },
                },
                minna: { reference: 'Minna no Nihongo I, Lesson 11', role: 'chronology-map-only' },
                genki: { taskId: 'genki-2e:l1-l21:lesson-1-workbook-1', role: 'post-instruction-number-reinforcement-only' },
            },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'Place A から Place B まで transportation で Time period かかります。',
            'どのくらい かかりますか。',
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '2hours by bus / 30mins by tube usually',
            '1hour and half on foot / only 15 mins by tube usually',
            'about 3hours on foot / 45mins by bus and tube usually',
        ]);
    });

    it('keeps the source dialogue and Japanese answers out of the DOM until an attempt', async () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const host = document.createElement('main');
        document.body.append(host);
        const controller = commuteComparisonLogPlugin.render(activity, {
            language: 'en', replace(view) { host.replaceChildren(view); }, announce() {},
        }, async submitted => runtime.evaluate(activity, submitted));

        expect(host.querySelector('[data-listening-support]')).toBeNull();
        expect(host.textContent).not.toContain('きのう ちかてつ の ストライキ が ありましたね。');
        expect(host.textContent).not.toContain('バスで ２じかん かかりました。いつも ちかてつで ３０ぷん だけ です。');

        for (const select of host.querySelectorAll<HTMLSelectElement>('select')) select.selectedIndex = 1;
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());

        expect(host.textContent).toContain('きのう ちかてつ の ストライキ が ありましたね。');
        expect(host.textContent).toContain('バスで ２じかん かかりました。いつも ちかてつで ３０ぷん だけ です。');
        controller.dispose();
    });

    it('requires the complete two-line commute record and seeds review only for missed source prompts', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const passed = runtime.evaluate(activity, { answers: activity.payload.rounds.map(round => ({
            roundId: round.id,
            disruptionTransportId: round.disruption.transportId,
            disruptionDurationId: round.disruption.durationId,
            usualTransportId: round.usual.transportId,
            usualDurationId: round.usual.durationId,
        })) });
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(3);

        const lapsed = runtime.evaluate(activity, { answers: activity.payload.rounds.map(round => ({
            roundId: round.id,
            disruptionTransportId: round.usual.transportId,
            disruptionDurationId: round.usual.durationId,
            usualTransportId: round.disruption.transportId,
            usualDurationId: round.disruption.durationId,
        })) });
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 0 });
        expect(lapsed.reviewSeeds).toHaveLength(3);
    });

    it('ships the source pages and untouched A-46 audio in both public trees', () => {
        const assets = [
            ['moodle-chapter-11-4-duration-page-1.png', '549fadcb25776014c1901d17cdc3e5ac032da901c615cc1b31e66252cc444e12'],
            ['moodle-chapter-11-4-duration-page-3.png', '18979cb3a0916d93ea0e507bfbfb036ea2f95142c8711a0fadb7d16edc75f4df'],
            ['moodle-46-a-46.mp3', '4f292de0dd3a5791bfdafd668df598ea1e0dc20036fcce467d3213d7ab53fb97'],
        ] as const;
        for (const [filename, sha256] of assets) {
            const publicAsset = path.resolve('public/academy/content/lessons/l1-l21', filename);
            const docsAsset = path.resolve('docs/public/academy/content/lessons/l1-l21', filename);
            const bytes = fs.readFileSync(publicAsset);
            expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
            expect(fs.readFileSync(docsAsset)).toEqual(bytes);
        }
    });

    it('makes the completed Lesson 21 activity reachable in Peter and Angel’s chapter', async () => {
        const chapter = await loadLessonActivityChapter('l1-l21', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l21',
            host: { id: 'peter' },
            beats: [{ id: 'sensei-commute-comparison-log', activity: { kind: 'academy-commute-comparison-log' } }],
        });
    });
});
