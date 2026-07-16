import fs from 'node:fs';
import path from 'node:path';
import { projectWorldPlace, worldTimePhase } from '../../src/academy/domain/world-locations';
import { renderWorldPlaceScreen } from '../../src/academy/ui/world-screen';

const PROGRESS = {
    completedScenes: ['scene:arrival'],
    completedEncounterIds: ['encounter:arrival'],
    metCharacterIds: ['nanako'],
    seenIntroductions: ['place:konbini'],
} as const;

afterEach(() => document.body.replaceChildren());

describe('Konbini living-paper register', () => {
    it('stays in rainy early evening and rotates exact Lesson 7 transactions', () => {
        const visits = [0, 1, 2].map(konbini => projectWorldPlace('konbini', {
            ...PROGRESS,
            worldVisits: { konbini },
        }));

        expect(visits.map(place => place.practice?.id)).toEqual([
            'konbini-shirt-price',
            'konbini-cd-price',
            'konbini-bag-checkout',
        ]);
        expect(visits.map(place => place.practice?.audioLine)).toEqual([
            'シャツは ３，０００えん',
            'どれも １，０００えん',
            'この かばんは いくらですか。８，０００えんです。',
        ]);
        expect(visits.map(place => place.practice?.review?.sourceQuestionId)).toEqual([
            'l1-l07/ex-listen-detail',
            'l1-l07/ex-read-price',
            'l1-l07/ex-ikura-cloze',
        ]);
        expect(visits[2]?.practice?.manipulation).toMatchObject({
            kind: 'cash-count',
            correctCount: 8,
            completionLine: { ja: 'この かばんを ください' },
        });
        expect(worldTimePhase(PROGRESS, 'konbini')).toBe('evening');
        expect(worldTimePhase({ ...PROGRESS, worldVisits: { konbini: 9 } }, 'konbini')).toBe('evening');
        expect(visits[0]?.exits).toEqual(['street', 'station', 'ramen', 'japan-centre']);

        const lesson = JSON.parse(fs.readFileSync(path.resolve('public/academy/content/lessons/008-l1-l07.json'), 'utf8')) as {
            components: Array<{ exercises?: Array<{
                id: string;
                japanese?: string;
                options?: Array<{ label: { ja: string }; correct?: boolean }>;
                answer?: { primary: string; alternatives?: string[] };
            }> }>;
        };
        const exercises = lesson.components.flatMap(component => component.exercises ?? []);
        const byId = (id: string) => exercises.find(exercise => exercise.id === id)!;
        expect(visits[0]?.practice?.audioLine).toBe(byId('ex-listen-detail').options?.find(option => option.correct)?.label.ja);
        expect(visits[1]?.practice?.audioLine).toBe(byId('ex-read-price').options?.find(option => option.correct)?.label.ja);
        expect(byId('ex-ikura-cloze').japanese).toBe('この かばんは ＿＿① ですか。 — ８，０００ ＿＿② です。');
        expect(byId('ex-kudasai').answer?.alternatives).toContain(
            visits[2]?.practice?.manipulation?.kind === 'cash-count'
                ? visits[2].practice.manipulation.completionLine?.ja
                : undefined,
        );
    });

    it('keeps one primary action while listening, counting, repairing, and completing', async () => {
        let finishListen!: (played: boolean) => void;
        const onListen = vi.fn(() => new Promise<boolean>(resolve => { finishListen = resolve; }));
        const onCount = vi.fn();
        const onPracticeComplete = vi.fn();
        const screen = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini', progress: PROGRESS,
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
            onListen, onObjectInteract: onCount, onPracticeComplete,
        });
        document.body.append(screen);

        const register = screen.querySelector<HTMLElement>('[data-konbini-transaction="konbini-shirt-price"]')!;
        const primary = register.querySelector<HTMLButtonElement>('.academy-konbini-primary-action')!;
        const counterButtons = [...register.querySelectorAll<HTMLButtonElement>('.academy-konbini-counter-button')];
        expect(screen.querySelector('.academy-world-action-speaker, .academy-world-curriculum')).toBeNull();
        expect(register.querySelector<HTMLElement>('.academy-world-transcript')?.hidden).toBe(true);
        expect(screen.querySelectorAll('.academy-konbini-primary-action')).toHaveLength(1);
        expect(counterButtons.every(button => button.disabled)).toBe(true);

        primary.click();
        expect(onListen).toHaveBeenCalledWith('シャツは ３，０００えん');
        expect(register.dataset.konbiniPhase).toBe('count');
        expect(register.querySelector<HTMLElement>('.academy-world-transcript')?.hidden).toBe(false);
        expect(primary.textContent).toBe('Check register');

        counterButtons[1]!.click();
        primary.click();
        expect(register.dataset.konbiniOutcome).toBe('repair');
        expect(onPracticeComplete).not.toHaveBeenCalled();
        finishListen(true);
        await Promise.resolve();
        expect(register.querySelector('.academy-konbini-status')?.textContent).toContain('adjust only');
        counterButtons[1]!.click();
        counterButtons[1]!.click();
        primary.click();

        expect(register.dataset.practiceComplete).toBe('true');
        expect(register.dataset.konbiniOutcome).toBe('pass');
        expect(register.querySelector('output')?.textContent).toBe('¥3,000');
        expect(register.querySelectorAll('.academy-konbini-note.is-counted')).toHaveLength(3);
        expect(onCount).toHaveBeenCalledTimes(3);
        expect(onPracticeComplete).toHaveBeenCalledWith(
            'konbini-shirt-price',
            'action:world-stamp:konbini',
            expect.objectContaining({
                attempt: expect.objectContaining({ responseKind: 'world-cash-count', sourceQuestionId: 'l1-l07/ex-listen-detail' }),
            }),
        );
    });

    it('varies Nanako, keeps Back, and gives each exit a reason to leave', () => {
        const onBack = vi.fn();
        const onTravel = vi.fn();
        const first = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini', progress: PROGRESS,
            onTravel, onActivity: vi.fn(), onClaimStamp: vi.fn(), onBack,
        });
        const replay = renderWorldPlaceScreen({
            language: 'en', place: 'konbini', route: 'konbini',
            progress: { ...PROGRESS, worldVisits: { konbini: 1 } },
            onTravel: vi.fn(), onActivity: vi.fn(), onClaimStamp: vi.fn(),
        });

        expect(first.querySelector('[data-world-character="nanako"]')?.getAttribute('data-presence')).toBe('counting-register-notes');
        expect(replay.querySelector('[data-world-character="nanako"]')?.getAttribute('data-presence')).toBe('restocking-cd-rack');
        expect([...first.querySelectorAll('.academy-world-exit-reason')].map(node => node.textContent)).toEqual([
            'Practise giving directions',
            'Listen to station notices',
            'Complete the order ticket',
            'Read a tag, then respond at the counter',
        ]);
        first.querySelector<HTMLButtonElement>('[data-exit-to="return"]')?.click();
        expect(onBack).toHaveBeenCalledOnce();
        first.querySelector<HTMLButtonElement>('[data-location="ramen"]')?.click();
        expect(onTravel).toHaveBeenCalledWith('ramen');
    });

    it('uses the dedicated responsive and reduced-motion contract', () => {
        const css = fs.readFileSync(path.resolve('src/academy/styles/konbini-world.css'), 'utf8');
        expect(css).toContain("data-current-place='konbini'");
        expect(css).toContain('.academy-konbini-cash-counter');
        expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*min-height:\s*44px/);
        expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none !important[\s\S]*transition:\s*none !important/);
    });
});
