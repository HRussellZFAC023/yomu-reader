import fs from 'node:fs';
import path from 'node:path';
import { canRenderAcademyCastPortrait } from '../../src/academy/domain/cast-registry';
import { projectWorldPlace, type WorldProgress } from '../../src/academy/domain/world-locations';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';

const PROGRESS: WorldProgress = {
    completedScenes: [],
    completedEncounterIds: [],
    metCharacterIds: ['rie', 'shin'],
    seenIntroductions: ['place:ramen'],
};

describe('ramen world', () => {
    beforeEach(() => document.body.replaceChildren());

    it('keeps exact Moodle orders separate from bounded Minna and Genki support', () => {
        const practice = projectWorldPlace('ramen', PROGRESS).practice!;
        const lessonNineteen = json('public/academy/content/lessons/020-l1-l19.json');
        const lessonEighteen = json('public/academy/content/lessons/019-l1-l18.json');
        const sourceQuestions = record(lessonNineteen.sourceQuestionNormalization).sourceQuestions as Array<Record<string, unknown>>;
        const genkiActivities = lessonEighteen.genkiInteractiveActivities as Array<Record<string, unknown>>;

        expect(practice.source).toEqual({
            primary: expect.objectContaining({
                corpus: 'moodle',
                sourceId: practice.review?.sourceQuestionId,
                relation: 'exact-task',
            }),
            supports: [
                expect.objectContaining({ corpus: 'minna', sourceId: 'japanese-minna:11-11', relation: 'sequence-only' }),
                expect.objectContaining({ corpus: 'genki', sourceId: 'genki-2e:l1-l18:lesson-3-literacy-1', relation: 'counter-recognition-only' }),
            ],
        });
        expect(sourceQuestions.some(question => practice.source?.primary.sourceId.endsWith(`/${String(question.id)}`)
            && question.reuse === 'verbatim-moodle')).toBe(true);
        expect(record(lessonNineteen.mapping).minna).toBe('Minna no Nihongo I · Lesson 11');
        expect(genkiActivities.some(activity => activity.id === practice.source?.supports[1]?.sourceId
            && activity.relation === 'post-instruction-counter-recognition')).toBe(true);
    });

    it('uses Shin only as consent-safe named presence and never borrows Peter or blocked portraits', () => {
        const screen = renderRamen({ progress: PROGRESS });

        expect(screen.querySelector('[data-world-character="shin"]')).not.toBeNull();
        expect(screen.querySelector('[data-world-character="peter"]')).toBeNull();
        expect(canRenderAcademyCastPortrait('shin', 'story-runtime')).toBe(false);
        expect(screen.querySelector('[data-world-character="shin"] img')).toBeNull();
        expect(screen.querySelector('[data-world-character="shin"] .academy-world-character-silhouette')).not.toBeNull();

        const beforeShin = renderRamen({ progress: { ...PROGRESS, metCharacterIds: ['rie'] } });
        expect(beforeShin.querySelector('[data-world-character="shin"]')).toBeNull();
        expect(beforeShin.querySelector('[data-world-character="rie"]')).not.toBeNull();
    });

    it('provides semantic quantity groups and a transcript fallback when speech fails', async () => {
        const screen = renderRamen({ onListen: vi.fn(async () => { throw new Error('speech unavailable'); }) });
        document.body.append(screen);
        const practice = screen.querySelector<HTMLElement>('[data-ramen-practice="tally-source-order"]')!;
        const listen = practice.querySelector<HTMLButtonElement>('[data-world-listen]')!;
        const transcript = practice.querySelector<HTMLElement>('.academy-world-transcript')!;

        expect(practice.getAttribute('aria-labelledby')).toBeTruthy();
        expect(practice.getAttribute('aria-describedby')).toBeTruthy();
        expect(practice.hasAttribute('data-jpdb-reader-surface-ignore')).toBe(true);
        expect(practice.querySelectorAll('fieldset.academy-ramen-order-row')).toHaveLength(3);
        expect(practice.querySelectorAll('fieldset > legend')).toHaveLength(3);
        practice.querySelectorAll<HTMLButtonElement>('[data-choice-id]').forEach(button => {
            expect(button.type).toBe('button');
            expect(button.getAttribute('aria-pressed')).toBe('false');
        });

        listen.click();
        expect(listen.getAttribute('aria-busy')).toBe('true');
        await vi.waitFor(() => expect(listen.getAttribute('aria-busy')).toBe('false'));
        expect(listen.disabled).toBe(false);
        expect(transcript.hidden).toBe(false);
        expect(practice.textContent).toContain('Audio is unavailable, so the transcript is shown.');
    });
});

function renderRamen(overrides: Partial<Parameters<typeof renderWorldPlaceScreen>[0]> = {}): HTMLElement {
    return renderWorldPlaceScreen({
        language: 'en',
        place: 'ramen',
        route: 'ramen',
        progress: PROGRESS,
        onTravel: vi.fn(),
        onActivity: vi.fn(),
        onClaimStamp: vi.fn(),
        ...overrides,
    });
}

function json(file: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected object');
    return value as Record<string, unknown>;
}
