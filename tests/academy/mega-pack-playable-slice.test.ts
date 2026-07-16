import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMegaPackPlayableSlice } from '../../src/academy/content/mega-pack-playable-slice';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import type { StoryReaderModel, TypedResponseModel } from '../../src/academy/minigames/activity-kit';

const crosswalk = JSON.parse(readFileSync(
    path.resolve('public/academy/content/source-pipeline/mega-pack-crosswalk.v1.json'),
    'utf8',
));

afterEach(() => document.body.replaceChildren());

describe('Mega Pack first playable slice', () => {
    it('composes writing-system, reader, and materials chapters with exact crosswalk provenance', () => {
        const runtime = createAcademyActivityRuntime();
        const slice = createMegaPackPlayableSlice();

        expect(slice.id).toBe('mega-pack-foundations-slice-01');
        expect(slice.chapters.map(chapter => chapter.id)).toEqual([
            'mega-kana-01',
            'mega-reader-01',
            'mega-materials-01',
        ]);
        expect(slice.beats).toHaveLength(5);
        for (const beat of slice.beats) {
            expect(runtime.validate(beat.activity)).toEqual([]);
            expect(beat.activity.conceptIds).toEqual(expect.arrayContaining([...beat.mapping.conceptIds]));
            const segment = crosswalk.segments.find((item: any) => item.id === beat.sourceSegmentId);
            expect(segment).toBeTruthy();
            expect(beat.provenance).toMatchObject({
                sourceId: segment.source.sourceId,
                relativePath: segment.source.relativePath,
                payloadSha256: segment.source.payloadSha256,
                locus: segment.source.locus,
                permission: segment.source.permission,
            });
            expect(segment.mapping.chapters).toContain(beat.mapping.chapterId);
            expect(segment.mapping.skills).toEqual(expect.arrayContaining([...beat.mapping.skills]));
            expect(segment.mapping.jlpt).toEqual(expect.arrayContaining([...beat.mapping.jlpt]));
            expect(segment.mapping.concepts).toEqual(expect.arrayContaining([...beat.mapping.conceptIds]));
        }
    });

    it('grades the verbatim kana, reader, and particle tasks deterministically', () => {
        const runtime = createAcademyActivityRuntime();
        const slice = createMegaPackPlayableSlice();
        const [aka, eki, reader, particle, sentence] = slice.beats.map(beat => beat.activity);
        expect((reader as StoryReaderModel).payload.sections.flatMap(section => section.paragraphs)).toEqual([
            'むかし。あるところに じさまと ばさまが おったそうな。',
            'ある日 じさま 山へ しば かりに ばさま 川へ せんたくに いったと。',
            'すると。川から 大きな もも どんぶら こっこ どんぶら こっこ ながれて きたんだと。',
            'ばさま そのもも ひろいあげ だいじに かかえて うちへ かえると 戸だなの なかに しまったそうな。',
        ]);

        expect(runtime.evaluate(aka, 'あか').result.outcome).toBe('pass');
        expect(runtime.evaluate(aka, 'あお').result.outcome).toBe('lapse');
        expect(runtime.evaluate(eki, 'えき').result.outcome).toBe('pass');
        expect(runtime.evaluate(particle, 'は').result.outcome).toBe('pass');
        expect(runtime.evaluate(particle, 'わ').result.outcome).toBe('lapse');
        expect(runtime.evaluate(sentence, 'わたしはがくせいです').result.outcome).toBe('pass');
        expect(runtime.evaluate(reader, { answers: [
            { questionId: 'river', optionId: 'old-woman' },
            { questionId: 'floating', optionId: 'peach' },
            { questionId: 'stored', optionId: 'cupboard' },
        ] }).result).toMatchObject({ outcome: 'pass', score: 1 });
    });

    it('mounts usable writing and reading controls with the exact reader excerpt', () => {
        const runtime = createAcademyActivityRuntime();
        const slice = createMegaPackPlayableSlice();
        const writing = slice.chapters[0].beats[0].activity as TypedResponseModel;
        const reader = slice.chapters[1].beats[0].activity as StoryReaderModel;
        const host = document.createElement('main');
        document.body.append(host);

        const writingController = runtime.mount(writing, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        expect(host.querySelector<HTMLInputElement>('input[lang="ja"]')).not.toBeNull();
        expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.textContent).toBe('Check answer');
        writingController.dispose();

        const registered: HTMLElement[] = [];
        const readerController = runtime.mount(reader, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
            registerReadingSurface(surface) {
                registered.push(surface);
                return () => undefined;
            },
        }, () => undefined);
        expect(host.querySelectorAll('.academy-story-reader-section')).toHaveLength(2);
        expect(host.querySelectorAll('.academy-story-reader-passage p')).toHaveLength(4);
        expect(host.querySelectorAll('fieldset')).toHaveLength(3);
        expect(host.textContent).toContain('川から 大きな もも どんぶら こっこ');
        expect(registered).toHaveLength(4);
        readerController.dispose();
    });
});
