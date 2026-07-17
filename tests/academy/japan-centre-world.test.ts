import { canRenderAcademyCastPortrait } from '../../src/academy/domain/cast-registry';
import { projectWorldPlace } from '../../src/academy/domain/world-locations';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';
import { worldChoiceButton } from './helpers/world-choice';

const progress = {
    completedScenes: [],
    completedEncounterIds: [],
    metCharacterIds: ['rie', 'aakash', 'sophie', 'felix'],
};

describe('Japan Centre world stream', () => {
    it('keeps the request and price replays honestly grounded in the permitted course corpus', () => {
        const first = projectWorldPlace('japan-centre', progress).practice!;
        const replay = projectWorldPlace('japan-centre', {
            ...progress,
            worldVisits: { 'japan-centre': 1 },
        }).practice!;

        expect(first.source).toEqual({
            primary: expect.objectContaining({
                corpus: 'moodle',
                sourceId: 'l1-l07/ex-kudasai',
                relation: 'source-sequenced-adaptation',
            }),
            supports: [
                expect.objectContaining({ corpus: 'minna', sourceId: 'japanese-minna:3-3', relation: 'sequence-only' }),
                expect.objectContaining({ corpus: 'genki', sourceId: 'genki-2e:l1-l07:lesson-2-workbook-3', relation: 'shopping-frame-only' }),
            ],
        });
        expect(replay.source?.primary).toEqual(expect.objectContaining({
            sourceId: 'l1-l07/ex-ikura-cloze',
            relation: 'source-sequenced-adaptation',
        }));
        expect(first.id).not.toBe(replay.id);
    });

    it('moves focus through the paper counter and never renders an uncleared cast portrait', () => {
        const practice = projectWorldPlace('japan-centre', progress).practice!;
        const onIntroductionComplete = vi.fn();
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en',
            place: 'japan-centre',
            route: 'world',
            progress,
            onTravel: vi.fn(),
            onActivity: vi.fn(),
            onClaimStamp: vi.fn(),
            onIntroductionComplete,
            onPracticeComplete,
        });
        document.body.append(screen);

        screen.querySelector<HTMLButtonElement>('.academy-world-arrival-continue')?.click();
        expect(onIntroductionComplete).toHaveBeenCalledWith('place:japan-centre');
        expect(document.activeElement).toBe(screen.querySelector('[data-world-listen="japan-centre-bag-request"]'));

        screen.querySelector<HTMLButtonElement>('[data-counter-tag="bag"]')?.click();
        const correctResponse = worldChoiceButton(screen, practice.choices, practice.correctChoiceId);
        expect(document.activeElement).toBe(correctResponse);
        correctResponse?.click();
        expect(document.activeElement).toBe(screen.querySelector('[role="status"]'));
        expect(onPracticeComplete).toHaveBeenCalledOnce();

        (['sophie', 'aakash', 'felix'] as const).forEach(personId => {
            if (!canRenderAcademyCastPortrait(personId, 'story-runtime')) {
                expect(screen.querySelector(`[data-world-character="${personId}"] img`)).toBeNull();
            }
        });
        const sources = screen.querySelector<HTMLElement>('[data-japan-centre-source-primary]')!;
        expect(sources.dataset.japanCentreSourceRelation).toBe('source-sequenced-adaptation');
        expect(sources.dataset.japanCentreSourceSupport).toBe('minna genki');
    });
});
