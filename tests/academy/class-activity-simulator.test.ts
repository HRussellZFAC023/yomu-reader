import fs from 'node:fs';
import path from 'node:path';
import {
    CLASS_ACTIVITY_PACKAGES,
    createClassActivityModel,
} from '../../src/academy/content/class-activity-catalog';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import {
    createClassActivitySession,
    type ClassActivityResponse,
} from '../../src/academy/minigames/class-activity-simulator';

const SOURCE_FILES = {
    'l1-l01': '002-l1-l01.json',
    'l1-l15': '016-l1-l15.json',
    'l2-l09': '036-l2-l09.json',
    'l2-l13': '040-l2-l13.json',
    'l1-l08': '009-l1-l08.json',
    'l1-l23': '024-l1-l23.json',
} as const;

afterEach(() => document.body.replaceChildren());

describe('Academy solo class activity simulator', () => {
    it('validates all six formats with exact local prompts and three explicit source axes', () => {
        const runtime = createAcademyActivityRuntime();
        expect(CLASS_ACTIVITY_PACKAGES.map(id => createClassActivityModel(id).payload.format)).toEqual([
            'pair', 'group', 'info-gap', 'role-card', 'board', 'race',
        ]);
        for (const packageId of CLASS_ACTIVITY_PACKAGES) {
            const activity = createClassActivityModel(packageId);
            const lesson = JSON.parse(fs.readFileSync(path.resolve(
                'public/academy/content/lessons', SOURCE_FILES[packageId],
            ), 'utf8'));
            expect(activity.payload.source.exactPrompt).toBe(lesson.mission.prompt);
            expect(activity.payload.source.mappings.map(mapping => mapping.corpus)).toEqual([
                'moodle', 'minna', 'genki',
            ]);
            expect(activity.payload.location.en).toBeTruthy();
            expect(runtime.validate(activity)).toEqual([]);
        }
    });

    it('runs authored partner and learner turns in order and produces deterministic evidence', () => {
        for (const packageId of CLASS_ACTIVITY_PACKAGES) {
            const activity = createClassActivityModel(packageId);
            const session = createClassActivitySession(activity);
            while (!session.complete) {
                const turn = session.currentTurn!;
                if (turn.kind === 'classmate') session.continueClassmate();
                else if (turn.kind === 'learner-choice') session.answer(turn.acceptedOptionIds[0]!);
                else session.answer(turn.requiredGroups!.map(group => group[0]).join('。'));
            }
            expect(session.transcript.map(entry => entry.turnId)).toEqual(activity.payload.turns.map(turn => turn.id));
            expect(createAcademyActivityRuntime().evaluate(activity, session.response).result).toMatchObject({
                outcome: 'pass', score: 1, errorTags: [],
            });
        }
    });

    it('keeps private cards controlled, race untimed, and board progress semantic in the shared view', () => {
        const runtime = createAcademyActivityRuntime();
        const infoGap = createClassActivityModel('l2-l09');
        const host = document.createElement('main');
        const controller = runtime.mount(infoGap, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, () => undefined);
        document.body.append(host);
        expect(host.querySelector('.academy-class-source-prompt')?.textContent).toBe(infoGap.payload.source.exactPrompt);
        const privateCard = host.querySelector<HTMLElement>('.academy-class-private-card')!;
        expect(privateCard.hidden).toBe(true);
        const reveal = host.querySelector<HTMLButtonElement>('[aria-expanded="false"]')!;
        reveal.click();
        expect(reveal.getAttribute('aria-expanded')).toBe('true');
        expect(privateCard.hidden).toBe(false);
        expect(host.querySelector('[role="status"]')).not.toBeNull();
        controller.dispose();

        const board = createClassActivityModel('l1-l08');
        expect(board.payload.board?.spaces).toHaveLength(5);
        const race = createClassActivityModel('l1-l23');
        expect(race.payload.race).toMatchObject({ pace: 'untimed', checkpointCount: 8 });
    });

    it('fails the precise learner turns that lack required evidence', () => {
        const activity = createClassActivityModel('l2-l13');
        const response: ClassActivityResponse = {
            answers: activity.payload.turns
                .filter(turn => turn.kind !== 'classmate')
                .map(turn => ({ turnId: turn.id, value: turn.kind === 'learner-choice' ? 'abrupt' : '行きます' })),
        };
        const result = createAcademyActivityRuntime().evaluate(activity, response).result;
        expect(result.outcome).toBe('lapse');
        expect(result.errorTags).toHaveLength(3);
        expect(result.errorTags).toEqual(expect.arrayContaining([
            'role-card-two-positive-reasons',
            'role-card-warm-alternative',
            'role-card-swapped-refusal',
        ]));
    });
});
