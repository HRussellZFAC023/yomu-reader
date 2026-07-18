import path from 'node:path';
import { createLessonTwentyTwoKatakanaShapeRelayBeat } from '../../src/academy/content/lesson-twenty-two-katakana-shape-relay';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type KatakanaShapeRelayModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): KatakanaShapeRelayModel {
    return createLessonTwentyTwoKatakanaShapeRelayBeat().activity as KatakanaShapeRelayModel;
}

function response(activity = model()) {
    return {
        placements: activity.payload.rounds.map(round => ({ roundId: round.id, kanaId: round.id })),
    };
}

describe('Lesson 22 Sensei katakana shape relay', () => {
    it('teaches the exact Moodle vowel row before the original relay and labels support sources honestly', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'ア　イ　ウ　エ　オ',
            'Katakana / Hiragana / Roman-ji',
        ]);
        expect(activity.payload.rounds.map(round => round.kana)).toEqual(['ウ', 'ア', 'オ', 'イ', 'エ']);
        expect(activity.payload.rounds.map(round => round.sourceCellId)).toEqual([
            'moodle:5489603:katakana-writing-system:p1:basic-katakana:row-1:cell-3',
            'moodle:5489603:katakana-writing-system:p1:basic-katakana:row-1:cell-1',
            'moodle:5489603:katakana-writing-system:p1:basic-katakana:row-1:cell-5',
            'moodle:5489603:katakana-writing-system:p1:basic-katakana:row-1:cell-2',
            'moodle:5489603:katakana-writing-system:p1:basic-katakana:row-1:cell-4',
        ]);
        expect(activity.payload.audioSupport).toEqual({
            provider: 'canonical-yomu-pronunciation-service',
            sourceAudioStatus: 'not-present-in-moodle-archive',
            role: 'post-instruction-runtime-pronunciation-support',
        });
        expect(activity.payload.supportReferences).toMatchObject({
            minna: { reference: 'Minna no Nihongo I, Katakana strand', role: 'chronology-map-only' },
            genki: { taskId: 'genki-2e:l1-l22:lesson-2-literacy-wb-1', lineLocus: [76, 93] },
        });
    });

    it('grades a complete relay deterministically and only seeds missed chart cells for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const pass = runtime.evaluate(activity, response(activity));
        expect(pass.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(pass.reviewSeeds.map(seed => seed.content.expression)).toEqual(['ウ', 'ア', 'オ', 'イ', 'エ']);
        const lapse = runtime.evaluate(activity, {
            placements: response(activity).placements.map((placement, index, all) => index < 2
                ? { ...placement, kanaId: all[1 - index].kanaId }
                : placement),
        });
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 0.6 });
        expect(lapse.reviewSeeds).toHaveLength(2);
        expect(lapse.reviewSeeds.every(seed => seed.reason === 'repair')).toBe(true);
    });

    it('plays the selected station through the canonical pronunciation host before a tile is committed', async () => {
        const host = document.createElement('main');
        const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
        document.body.append(host);
        const controller = createAcademyActivityRuntime().mount(model(), {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            playPronunciation,
        }, () => undefined);

        host.querySelector<HTMLButtonElement>('.academy-katakana-relay-station')!.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith('ウ', 'ウ'));
        expect(host.querySelector('.academy-katakana-relay-value')?.textContent).toBe('·');
        expect(host.textContent).toMatch(/Yomu pronunciation support/i);
        controller.dispose();
    });

    it('ships the two exact Moodle chart renders in both public trees', () => {
        const assets = [
            ['moodle-katakana-writing-basic-page-1.png', 'e7f953396daf44afdcd70bdcab08904280270a8029ea5f2073076e53a092e417'],
            ['moodle-katakana-list-page-1.png', '5605d67fd4553c40ab8b41ec40a8302791219964683fff435b4f08684342b038'],
        ] as const;
        for (const [filename, sha256] of assets) {
            const publicAsset = path.resolve('public/academy/content/lessons/l1-l22', filename);
            const docsAsset = path.resolve('docs/public/academy/content/lessons/l1-l22', filename);
            expect(sha256File(publicAsset)).toBe(sha256);
            expect(filesHaveSameContent(docsAsset, publicAsset)).toBe(true);
        }
    });

    it('makes the completed activity reachable in Stasi and Mika’s Lesson 22 chapter', async () => {
        const chapter = await loadLessonActivityChapter('l1-l22', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l22',
            host: { id: 'stasi' },
            beats: [{ id: 'sensei-katakana-shape-relay', activity: { kind: 'academy-katakana-shape-relay' } }],
        });
    });
});
