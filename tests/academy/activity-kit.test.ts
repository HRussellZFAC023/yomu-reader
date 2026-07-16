import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseKanjiVGSvg } from '../../src/reader/kanji/vg';
import type { KanjiWritingModel, KanjiWritingService } from '../../src/academy/integration/yomu-bridge';
import {
    LESSON_ACTIVITY_CHAPTER_PACKAGES,
    loadLessonActivityChapter,
} from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import { teachingSupportForActivity } from '../../src/academy/ui/lesson-activity-support';
import type {
    DragSortModel,
    SequenceModel,
    SoundCheckModel,
    StoryReaderModel,
    TypedResponseModel,
} from '../../src/academy/minigames/activity-kit';
import type { KatakanaColumnSortModel } from '../../src/academy/minigames/katakana-column-sort';

const TRACE: KanjiWritingModel = {
    character: '一',
    svg: '<svg viewBox="0 0 109 109"><path d="M10 50 L99 50"/></svg>',
    strokeCount: 1,
    strokeShapes: [[{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]],
    source: { name: 'KanjiVG', url: 'https://kanjivg.tagaini.net/', licence: 'CC BY-SA 3.0', revision: 'test' },
};

const RI_TRACE = kanjiTraceFromPinnedAsset('理', '07406.svg');
const RETURN_TRACE = kanjiTraceFromPinnedAsset('帰', '05e30.svg');

const kanjiWriting: KanjiWritingService = {
    lookup: async character => ({ '一': TRACE, '帰': RETURN_TRACE, '理': RI_TRACE })[character] ?? null,
};

afterEach(() => document.body.replaceChildren());

describe('Academy reusable activity kit', () => {
    it('validates every canonical lesson binding through the shared runtime', async () => {
        const runtime = createAcademyActivityRuntime();
        const chapters = await Promise.all(LESSON_ACTIVITY_CHAPTER_PACKAGES.map(id => loadLessonActivityChapter(id, kanjiWriting)));

        expect(chapters.every(Boolean)).toBe(true);
        expect(chapters.map(chapter => chapter?.lessonPackageId)).toEqual([...LESSON_ACTIVITY_CHAPTER_PACKAGES]);
        for (const chapter of chapters) {
            expect(chapter?.host.name).toBeTruthy();
            expect(chapter?.location.en).toBeTruthy();
            for (const beat of chapter?.beats ?? []) {
                expect(runtime.validate(beat.activity), `${chapter?.lessonPackageId}/${beat.id}`).toEqual([]);
            }
        }
    });

    it('grades kana, pronunciation, bag matching, ordering, weather, and reading deterministically', async () => {
        const runtime = createAcademyActivityRuntime();
        const l1l08 = (await loadLessonActivityChapter('l1-l08', kanjiWriting))!;
        const sound = l1l08.beats.find(beat => beat.activity.kind === 'academy-sound-check')!.activity as SoundCheckModel;
        expect(runtime.evaluate(sound, { answers: [
            { roundId: 'long-vowel', value: 5 },
            { roundId: 'small-tsu', value: 4 },
        ] }).result.outcome).toBe('pass');

        const l1l18 = (await loadLessonActivityChapter('l1-l18', kanjiWriting))!;
        const bag = dragSortActivity(l1l18, 'activity:l1-l18-vegetable-bag');
        const bagResponse = { placements: bag.payload.items.map(item => ({ itemId: item.id, zoneId: item.correctZoneId })) };
        expect(runtime.evaluate(bag, bagResponse).result).toMatchObject({ outcome: 'pass', score: 1 });
        const matching = dragSortActivity(l1l18, 'activity:l1-l18-counter-match');
        expect(runtime.evaluate(matching, {
            placements: matching.payload.items.map(item => ({ itemId: item.id, zoneId: item.correctZoneId })),
        }).result.outcome).toBe('pass');

        const kana = katakanaColumnSortActivity((await loadLessonActivityChapter('l1-l23', kanjiWriting))!);
        expect(runtime.evaluate(kana, katakanaColumnSortResponse(kana)).result.outcome).toBe('pass');
        expect(runtime.evaluate(kana, katakanaColumnSortResponse(kana, ['a', 'o', 'i', 'e', 'u'])).result.outcome).toBe('lapse');

        const weatherChapter = (await loadLessonActivityChapter('l2-l22', kanjiWriting))!;
        const weather = weatherChapter.beats[0].activity as TypedResponseModel;
        expect(runtime.evaluate(weather, '雨が降るでしょう。かさを持っていったほうがいいです。').result.outcome).toBe('pass');
        const sequence = weatherChapter.beats[1].activity as SequenceModel;
        expect(runtime.evaluate(sequence, { order: ['fold', 'frame', 'tie', 'hang'] }).result.outcome).toBe('pass');

        const story = (await loadLessonActivityChapter('l2-l34', kanjiWriting))!.beats[0].activity as StoryReaderModel;
        expect(runtime.evaluate(story, { answers: [
            { questionId: 'uncertain', optionId: 'shared' },
            { questionId: 'clues', optionId: 'three' },
            { questionId: 'dish', optionId: 'rice' },
        ] }).result.outcome).toBe('pass');
    });

    it('provides named audio controls and a complete keyboard alternative to drag and drop', async () => {
        const runtime = createAcademyActivityRuntime();
        const sound = (await loadLessonActivityChapter('l1-l08', kanjiWriting))!
            .beats.find(beat => beat.activity.kind === 'academy-sound-check')!.activity as SoundCheckModel;
        const soundRoot = document.createElement('main');
        const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
        const soundController = runtime.mount(sound, {
            replace(view) { soundRoot.replaceChildren(view); },
            announce() {},
            playPronunciation,
        }, () => undefined);
        document.body.append(soundRoot);
        const play = soundRoot.querySelector<HTMLButtonElement>('.academy-sound-play')!;
        expect(play.getAttribute('aria-label')).toBe('Play Japanese audio');
        expect(play.title).toBe('Play Japanese audio');
        expect(play.dataset.tooltip).toBe('Play Japanese audio');
        play.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith('おばあさん', undefined));
        expect(soundRoot.querySelector('[role="status"]')).not.toBeNull();
        soundController.dispose();

        const bag = dragSortActivity((await loadLessonActivityChapter('l1-l18', kanjiWriting))!, 'activity:l1-l18-vegetable-bag');
        const bagRoot = document.createElement('main');
        const bagController = runtime.mount(bag, {
            replace(view) { bagRoot.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.replaceChildren(bagRoot);
        const item = bagRoot.querySelector<HTMLButtonElement>('[data-item-id="carrot-1"]')!;
        expect(item.draggable).toBe(true);
        item.click();
        const select = bagRoot.querySelector<HTMLSelectElement>('.academy-drag-keyboard-controls select')!;
        select.value = 'bag';
        bagRoot.querySelector<HTMLButtonElement>('.academy-drag-keyboard-controls button')!.click();
        const moved = bagRoot.querySelector<HTMLElement>('[data-zone-id="bag"] [data-item-id="carrot-1"]');
        expect(moved).not.toBeNull();
        expect(moved?.getAttribute('aria-pressed')).toBe('true');
        bagController.dispose();
    });

    it('renders stable ordering controls and a genuinely extended Japanese reading surface', async () => {
        const runtime = createAcademyActivityRuntime();
        const weather = (await loadLessonActivityChapter('l2-l22', kanjiWriting))!;
        const sequence = weather.beats[1].activity as SequenceModel;
        const sequenceRoot = document.createElement('main');
        const sequenceController = runtime.mount(sequence, {
            replace(view) { sequenceRoot.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.append(sequenceRoot);
        const moveButtons = sequenceRoot.querySelectorAll<HTMLButtonElement>('.academy-sequence-move');
        expect(moveButtons).toHaveLength(8);
        expect([...moveButtons].every(button => button.getAttribute('aria-label'))).toBe(true);
        expect([...moveButtons].every(button => button.title === button.dataset.tooltip)).toBe(true);
        sequenceController.dispose();

        const story = (await loadLessonActivityChapter('l2-l34', kanjiWriting))!.beats[0].activity as StoryReaderModel;
        const storyRoot = document.createElement('main');
        const registered: HTMLElement[] = [];
        const storyController = runtime.mount(story, {
            replace(view) { storyRoot.replaceChildren(view); },
            announce() {},
            registerReadingSurface(surface) {
                registered.push(surface);
                return () => undefined;
            },
        }, () => undefined);
        document.body.replaceChildren(storyRoot);
        expect(storyRoot.querySelectorAll('.academy-story-reader-section')).toHaveLength(3);
        expect(storyRoot.querySelectorAll('.academy-story-reader-passage p')).toHaveLength(6);
        expect(storyRoot.querySelectorAll('fieldset')).toHaveLength(3);
        expect(storyRoot.querySelectorAll('input[type="radio"]')).toHaveLength(9);
        expect(registered).toHaveLength(6);
        storyController.dispose();
    });

    it('teaches the ka-row prerequisite and reveals a keyboard-accessible column-sort repair ladder', async () => {
        const runtime = createAcademyActivityRuntime();
        const model = katakanaColumnSortActivity((await loadLessonActivityChapter('l1-l23', kanjiWriting))!);
        const expected = runtime.evaluate(model, katakanaColumnSortResponse(model, ['a', 'o', 'i', 'e', 'u'])).result.feedback;
        expect(model.payload.teaching.map(step => step.pattern)).toEqual(['カ　キ　ク　ケ　コ', 'カ　キ　ク　ケ　コ']);
        expect(teachingSupportForActivity(model)).toMatchObject({
            kind: 'context',
            entries: [{ japanese: model.prompt.ja, translation: model.prompt.en }],
        });
        const root = document.createElement('main');
        const playPronunciation = vi.fn(async () => ({ dispose: vi.fn() }));
        runtime.mount(model, {
            language: 'en',
            replace(view) { root.replaceChildren(view); },
            announce() {},
            playPronunciation,
        }, () => undefined);
        document.body.replaceChildren(root);

        expect(root.querySelectorAll('.academy-katakana-sort-teaching article')).toHaveLength(2);
        expect(root.querySelectorAll('.academy-katakana-sort-sources img')).toHaveLength(2);
        const signals = root.querySelectorAll<HTMLButtonElement>('.academy-katakana-sort-signal');
        expect(signals).toHaveLength(5);
        expect([...signals].every(signal => signal.getAttribute('aria-label'))).toBe(true);
        signals[0]!.click();
        await vi.waitFor(() => expect(playPronunciation).toHaveBeenCalledWith('ク', 'ク'));

        const shiftedColumns = ['a', 'o', 'i', 'e', 'u'];
        for (const [index, round] of model.payload.rounds.entries()) {
            root.querySelector<HTMLButtonElement>(`[data-kana-id="${round.id}"]`)!.click();
            root.querySelector<HTMLButtonElement>(`[data-column-id="${shiftedColumns[index]}"]`)!.click();
        }
        root.querySelector<HTMLButtonElement>('.academy-katakana-sort-submit')!.click();
        await vi.waitFor(() => expect(root.querySelector('.academy-progressive-hint-button')).not.toBeNull());
        expect(root.textContent).not.toContain(expected.repairPrompt!.en);
        const hint = root.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        hint.click();
        const revealed = root.querySelector<HTMLElement>('.academy-progressive-hints-revealed')!;
        expect(revealed.textContent).toContain(expected.repairPrompt!.en);
        expect(revealed.textContent).not.toContain(expected.nearbyExample!.en);
        hint.click();
        expect(revealed.textContent).toContain(expected.nearbyExample!.en);
    });

    it('keeps a sequence attempt and offers keyboard-accessible repair after a lapse', async () => {
        const runtime = createAcademyActivityRuntime();
        const model = (await loadLessonActivityChapter('l2-l22', kanjiWriting))!.beats[1].activity as SequenceModel;
        const expected = runtime.evaluate(model, { order: model.payload.items.map(item => item.id) }).result.feedback;
        expect(teachingSupportForActivity(model)).toMatchObject({
            kind: 'example',
            entries: [{ japanese: '紙を折って、骨をつけて、ひもを結びます。' }],
        });
        const root = document.createElement('main');
        runtime.mount(model, {
            language: 'en',
            replace(view) { root.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.replaceChildren(root);

        const later = root.querySelector<HTMLButtonElement>('[data-sequence-id="hang"] .academy-sequence-move:last-child')!;
        later.focus();
        later.click();
        await Promise.resolve();
        expect(document.activeElement).toBe(root.querySelector('[data-sequence-id="hang"] .academy-sequence-move:not(:disabled)'));
        expect(root.querySelectorAll<HTMLElement>('.academy-sequence-item')[1]?.dataset.sequenceId).toBe('hang');

        const check = root.querySelector<HTMLButtonElement>('.academy-button-primary')!;
        check.click();
        await vi.waitFor(() => expect(root.querySelector('.academy-progressive-hint-button')).not.toBeNull());
        expect(root.querySelectorAll<HTMLElement>('.academy-sequence-item')[1]?.dataset.sequenceId).toBe('hang');
        expect(document.activeElement).toBe(check);
        expect(root.textContent).not.toContain(expected.repairPrompt!.en);
        const hint = root.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        hint.click();
        expect(root.textContent).toContain(expected.repairPrompt!.en);
        hint.click();
        expect(root.textContent).toContain(expected.nearbyExample!.en);
    });

    it('ships touch sizing, focus visibility, and reduced-motion fallbacks with the activity family', () => {
        const css = readFileSync(path.join(process.cwd(), 'src/academy/minigames/activity-kit/style.css'), 'utf8');
        expect(css).toMatch(/academy-typed-response-input\s*\{[\s\S]*min-height:\s*44px/);
        expect(css).toMatch(/academy-sequence-controls\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, 44px\)/);
        expect(css).toMatch(/academy-sequence-move\s*\{[\s\S]*width:\s*44px;[\s\S]*height:\s*44px/);
        expect(css).toContain('.academy-sequence-move:focus-visible');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('animation-duration: 0.01ms');
    });
});

function dragSortActivity(
    chapter: NonNullable<Awaited<ReturnType<typeof loadLessonActivityChapter>>>,
    activityId: 'activity:l1-l18-vegetable-bag' | 'activity:l1-l18-counter-match',
): DragSortModel {
    const activity = chapter.beats.find(beat => beat.activity.kind === 'academy-drag-sort' && beat.activity.id === activityId)?.activity;
    if (!activity || activity.kind !== 'academy-drag-sort') throw new Error(`Missing drag-sort activity ${activityId}.`);
    return activity as DragSortModel;
}

function katakanaColumnSortActivity(
    chapter: NonNullable<Awaited<ReturnType<typeof loadLessonActivityChapter>>>,
): KatakanaColumnSortModel {
    const activity = chapter.beats.find(beat =>
        beat.activity.kind === 'academy-katakana-column-sort'
        && beat.activity.id === 'activity:l1-l23-sensei-katakana-column-sort',
    )?.activity;
    if (!activity || activity.kind !== 'academy-katakana-column-sort') {
        throw new Error('Missing Lesson 23 katakana column-sort activity.');
    }
    return activity as KatakanaColumnSortModel;
}

function katakanaColumnSortResponse(
    model: KatakanaColumnSortModel,
    columns = model.payload.rounds.map(round => round.vowelColumnId),
) {
    return {
        placements: model.payload.rounds.map((round, index) => ({ kanaId: round.id, columnId: columns[index]! })),
    };
}

function kanjiTraceFromPinnedAsset(character: string, fileName: string): KanjiWritingModel {
    const svg = readFileSync(path.join(process.cwd(), 'public/academy/vendor/kanjivg', fileName), 'utf8');
    const parsed = parseKanjiVGSvg(svg, character);
    if (!parsed) throw new Error(`Unable to parse pinned KanjiVG trace for ${character}.`);
    return {
        character: parsed.kanji,
        svg: parsed.svg,
        strokeCount: parsed.strokeCount,
        strokeShapes: parsed.strokeShapes ?? [],
        source: {
            name: 'KanjiVG',
            url: 'https://kanjivg.tagaini.net/',
            licence: 'CC BY-SA 3.0',
            revision: 'eab57831f1e418016a029266c4b17bf824b9af68',
        },
    };
}
