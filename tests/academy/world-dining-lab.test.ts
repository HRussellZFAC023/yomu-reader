import { markWorldVisit, projectWorldPlace, worldRouteForPlace } from '../../src/academy/domain/world-locations';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';
import { worldChoiceButtonByLabel } from './helpers/world-choice';

afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe('Student Dining and Language Lab current-place replays', () => {
    const progress = {
        completedScenes: ['scene:arrival'],
        completedEncounterIds: ['encounter:arrival'],
        metCharacterIds: ['aakash', 'felix', 'xingyu', 'mika'],
        seenIntroductions: ['place:cafeteria', 'place:lab'],
        worldVisits: {},
    } as const;

    it('opens Student Dining with rotating source-backed tray outcomes and canonical review evidence', () => {
        const first = projectWorldPlace('cafeteria', progress);
        const returningProgress = { ...progress, worldVisits: markWorldVisit(progress.worldVisits, 'cafeteria') };
        const returning = projectWorldPlace('cafeteria', returningProgress);
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'cafeteria', route: 'world', progress,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onPracticeComplete,
        });

        expect(first).toMatchObject({
            label: { ja: '学生食堂', en: 'Student dining' },
            availability: { state: 'open' },
            composition: { motif: 'cafeteria', purposeSurface: 'meal-tray' },
            activity: { curriculum: { id: 'l1-l19:ordering-food', surface: 'moodle', state: 'grounded' } },
        });
        expect(first.practice?.id).toBe('cafeteria-draft-beer-order');
        expect(returning.practice?.id).toBe('cafeteria-draft-beer-request');
        expect(worldRouteForPlace('cafeteria')).toBe('world');
        expect(first.practice?.review?.sourceQuestionId)
            .toBe('moodle:6223185:chapter-11-2-ordering-food:p2:dialogue:drink-order');

        const practice = screen.querySelector<HTMLElement>('[data-cafeteria-practice="tray-assembly"]')!;
        const tray = screen.querySelector<HTMLElement>('[data-cafeteria-sensory="tray-assembly"]')!;
        expect(tray.textContent).toContain('自分のトレー');
        expect(practice.dataset.worldInteraction).toBe('token-order');
        expect(screen.querySelector('[data-world-character="aakash"]')?.getAttribute('data-presence'))
            .toBe('separate-table-choice');
        expect(screen.querySelector('[data-world-character="felix"] .academy-world-character-presence')?.textContent)
            .toContain('own tray');

        ['drink', 'object', 'quantity', 'request'].forEach(token => {
            practice.querySelector<HTMLButtonElement>(`[data-world-token="${token}"]`)?.click();
        });
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'cafeteria-draft-beer-order',
            'action:world-stamp:cafeteria',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-token-order',
                    sourceQuestionId: 'moodle:6223185:chapter-11-2-ordering-food:p2:dialogue:drink-order',
                }),
                reviewSeeds: [expect.objectContaining({
                    id: 'review:world:cafeteria:draft-beer-order',
                    content: expect.objectContaining({ expression: 'なまビールをふたつください。' }),
                })],
            }),
        );
    });

    it('keeps Lab shadowing learner-owned and records review evidence only after listen, repeat, and answer', async () => {
        const onPracticeComplete = vi.fn();
        const onListen = vi.fn(async () => true);
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'lab', route: 'lab', progress,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(), onListen, onPracticeComplete,
        });
        document.body.append(screen);

        const practice = screen.querySelector<HTMLElement>('[data-lab-practice="listen-repeat-answer"]')!;
        expect(screen.querySelector('[data-world-character="xingyu"]')?.getAttribute('data-presence'))
            .toBe('separate-booth-practice');
        expect(screen.querySelector('[data-world-character="mika"] .academy-world-character-presence')?.textContent)
            .toContain('separate playback lane');
        expect(projectWorldPlace('lab', progress).practice?.review?.sourceQuestionId)
            .toBe('source-question:classroom-phrase-09');

        practice.querySelector<HTMLButtonElement>('[data-world-listen]')?.click();
        await vi.waitFor(() => expect(onListen).toHaveBeenCalledWith(
            'もう一度お願いします。',
            'world-practice:lab-classroom-repair',
        ));
        practice.querySelector<HTMLButtonElement>('.academy-lab-speaking-button')?.click();
        worldChoiceButtonByLabel(practice, 'お願いします')?.click();

        expect(onPracticeComplete).toHaveBeenCalledWith(
            'lab-classroom-repair',
            'action:world-stamp:lab',
            expect.objectContaining({
                attempt: expect.objectContaining({
                    responseKind: 'world-listening-choice',
                    sourceQuestionId: 'source-question:classroom-phrase-09',
                }),
                reviewSeeds: [expect.objectContaining({
                    id: 'review:world:lab:classroom-repair',
                    content: expect.objectContaining({ expression: 'もう一度お願いします。' }),
                })],
            }),
        );
    });
});
