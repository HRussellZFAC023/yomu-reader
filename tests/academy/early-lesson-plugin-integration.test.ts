import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import type { KanjiWritingModel } from '../../src/academy/integration/yomu-bridge';

const TRACE: KanjiWritingModel = {
    character: '一',
    svg: '<svg viewBox="0 0 109 109"><path d="M10 50 L99 50"/></svg>',
    strokeCount: 1,
    strokeShapes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
    source: { name: 'KanjiVG', url: 'https://kanjivg.tagaini.net/', licence: 'CC BY-SA 3.0', revision: 'test' },
};

describe('early lesson plugin integration', () => {
    it.each([
        ['l1-l02', 'academy-profile-board'],
        ['l1-l03', 'academy-profile-question-match'],
        ['l1-l05', 'academy-possession-phrase-builder'],
        ['l1-l06', 'academy-place-and-owner-workbook'],
        ['l1-l08', 'academy-time-workbook'],
        ['l1-l09', 'academy-weekly-plan-workbook'],
        ['l1-l10', 'academy-daily-routine-workbook'],
        ['l1-l11', 'academy-adjective-description-workbook'],
        ['l1-l12', 'academy-preference-workbook'],
        ['l1-l13', 'academy-skill-understanding-workbook'],
        ['l1-l14', 'academy-reason-workbook'],
        ['l1-l16', 'academy-existence-location-workbook'],
        ['l1-l17', 'academy-museum-location-workbook'],
        ['l1-l19', 'academy-sentence-builder'],
        ['l1-l20', 'academy-frequency-lens'],
        ['l1-l21', 'academy-commute-comparison-log'],
        ['l1-l22', 'academy-katakana-shape-relay'],
        ['l1-l23', 'academy-katakana-column-sort'],
        ['l1-l24', 'academy-katakana-two-row-audio-route'],
        ['l1-l25', 'academy-katakana-row-switchboard'],
        ['l1-l26', 'academy-katakana-final-row-shelf'],
    ] as const)('makes %s reachable through its registered activity plugin', async (packageId, kind) => {
        const chapter = await loadLessonActivityChapter(packageId, {
            lookup: async character => character === '一' ? TRACE : null,
        });
        expect(chapter).not.toBeNull();
        const activity = chapter?.beats.find(beat => beat.activity.kind === kind)?.activity;
        expect(activity).toBeDefined();
        expect(createAcademyActivityRuntime().validate(activity!)).toEqual([]);
    });

    it('places the Lesson 12 preference workbook in the canonical menu story', async () => {
        const chapter = await loadLessonActivityChapter('l1-l12', {
            lookup: async () => null,
        });

        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l12',
            canonicalEpisodeId: 's1e08-menu-without-pictures',
            location: { en: 'Academy practice kitchen' },
            host: { id: 'shin' },
            beats: [{ id: 'preference-workbook', activity: { kind: 'academy-preference-workbook' } }],
        });
    });

    it('places the Lesson 13 skill-and-understanding workbook in the canonical game-club story', async () => {
        const chapter = await loadLessonActivityChapter('l1-l13', {
            lookup: async () => null,
        });

        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l13',
            canonicalEpisodeId: 's1e05-final-boss-kana',
            location: { en: 'Game club table' },
            host: { id: 'mika' },
            beats: [{ id: 'skill-understanding-workbook', activity: { kind: 'academy-skill-understanding-workbook' } }],
        });
    });

    it('places the Lesson 14 reason workbook in the canonical reason-giving story', async () => {
        const chapter = await loadLessonActivityChapter('l1-l14', {
            lookup: async () => null,
        });

        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l14',
            canonicalEpisodeId: 's1e02-margin-map',
            location: { en: 'Library study bay' },
            host: { id: 'rie' },
            beats: [{ id: 'reason-workbook', activity: { kind: 'academy-reason-workbook' } }],
        });
    });

    it('places the Lesson 16 existence-location workbook in the canonical route story', async () => {
        const chapter = await loadLessonActivityChapter('l1-l16', {
            lookup: async () => null,
        });

        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l16',
            canonicalEpisodeId: 's1e03-route-zero',
            location: { en: 'Academy courtyard' },
            host: { id: 'aakash' },
            beats: [{ id: 'existence-location-workbook', activity: { kind: 'academy-existence-location-workbook' } }],
        });
    });

    it('places the Lesson 17 museum-location workbook in the canonical location story', async () => {
        const chapter = await loadLessonActivityChapter('l1-l17', {
            lookup: async () => null,
        });

        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l17',
            canonicalEpisodeId: 's1e03-route-zero',
            location: { en: 'Academy courtyard' },
            host: { id: 'tom' },
            beats: [{ id: 'museum-location-workbook', activity: { kind: 'academy-museum-location-workbook' } }],
        });
    });
});
