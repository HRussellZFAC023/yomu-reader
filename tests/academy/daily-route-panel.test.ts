import { describe, expect, it, vi } from 'vitest';
import type { AcademyLanguage } from '../../src/reader/app/academy-copy';
import type {
    DailyLearningRoute,
    DailyRouteAction,
    DiegeticIncentive,
} from '../../src/academy/domain/daily-learning-loop';
import { renderDailyRoutePanel } from '../../src/academy/ui/daily-route-panel';

type IncentiveKind = DiegeticIncentive['kind'];

const INCENTIVE_CUES = {
    'journal-memory': {
        en: 'A memory stays in your journal',
        ja: '日誌に記憶が残ります',
    },
    'bond-scene': {
        en: "Someone's story continues",
        ja: '誰かとの物語が続きます',
    },
    'place-discovery': {
        en: 'Discover another side of this place',
        ja: '場所の新しい一面へ',
    },
    'source-unlock': {
        en: 'A new source opens',
        ja: '新しい資料が開きます',
    },
} satisfies Record<IncentiveKind, Record<AcademyLanguage, string>>;

describe('renderDailyRoutePanel', () => {
    it('renders exactly one visually primary action and no more than three visible actions', () => {
        const route = dailyRoute([
            action('repair', 'journal-memory'),
            action('lesson', 'source-unlock'),
            action('encounter', 'bond-scene'),
        ]);
        const panel = renderPanel(route);
        const visibleActions = [...panel.querySelectorAll<HTMLButtonElement>('[data-daily-action-id]')]
            .filter(button => !button.hidden);

        expect(visibleActions.length).toBeLessThanOrEqual(3);
        expect(panel.querySelectorAll('.academy-daily-route-action.is-primary')).toHaveLength(1);
        expect(visibleActions[0]?.dataset.dailyActionId).toBe(route.primaryAction.id);
        expect(visibleActions[0]?.classList.contains('is-primary')).toBe(true);
    });

    it('welcomes a learner back with prior progress intact and no loss economy language', () => {
        const route = dailyRoute([action('continue', 'journal-memory')], true);
        const panel = renderPanel(route);

        expect(route.recovery).toMatchObject({
            mode: 'welcome-back',
            rewardsPreserved: true,
            preservedAcademyRewardEventIds: ['journal:before-break'],
        });
        expect(panel.textContent).toContain('Welcome back. Everything you earned is still here.');
        expect(panel.querySelector('[data-daily-action-id="continue"]')).not.toBeNull();
        expect(panel.textContent).not.toMatch(/broken|lost|streak|rewards?|\bXP\b/i);
    });

    it('exposes every diegetic incentive kind with its concise localized payoff', () => {
        const actions = (Object.keys(INCENTIVE_CUES) as IncentiveKind[])
            .map(kind => action(kind, kind));

        for (const language of ['en', 'ja'] as const) {
            for (const group of [actions.slice(0, 3), actions.slice(3)]) {
                const panel = renderPanel(dailyRoute(group), language);
                group.forEach(expectedAction => {
                    const button = panel.querySelector<HTMLButtonElement>(
                        `[data-daily-action-id="${expectedAction.id}"]`,
                    )!;
                    expect(button.dataset.incentiveKind).toBe(expectedAction.incentive.kind);
                    expect(button.querySelector('.academy-daily-route-action-payoff')?.textContent)
                        .toBe(INCENTIVE_CUES[expectedAction.incentive.kind][language]);
                });
            }
        }
    });

    it('delegates the exact clicked action object', () => {
        const actions = [action('primary', 'source-unlock'), action('supporting', 'place-discovery')];
        const onOpenAction = vi.fn();
        const panel = renderPanel(dailyRoute(actions), 'en', onOpenAction);

        panel.querySelector<HTMLButtonElement>('[data-daily-action-id="supporting"]')!.click();

        expect(onOpenAction).toHaveBeenCalledOnce();
        expect(onOpenAction.mock.calls[0]?.[0]).toBe(actions[1]);
    });
});

function renderPanel(
    route: DailyLearningRoute,
    language: AcademyLanguage = 'en',
    onOpenAction = vi.fn(),
): HTMLElement {
    return renderDailyRoutePanel({ language, route, onOpenAction });
}

function action(id: string, incentiveKind: IncentiveKind): DailyRouteAction {
    return {
        kind: 'lesson',
        reason: 'next-grounded-lesson',
        id,
        label: `Continue ${id}`,
        modeId: 'normal-challenge',
        skill: 'reading',
        format: 'reading',
        conceptIds: [`concept:${id}`],
        incentive: { kind: incentiveKind, id: `incentive:${id}` },
        grounding: { sourceId: `source:${id}` },
    };
}

function dailyRoute(actions: readonly DailyRouteAction[], welcomeBack = false): DailyLearningRoute {
    const [primaryAction, ...supportingActions] = actions;
    if (!primaryAction) throw new Error('Test route needs a primary action.');
    return {
        primaryAction,
        supportingActions,
        earnedIncentives: [],
        recovery: welcomeBack
            ? {
                  mode: 'welcome-back',
                  missedDays: 3,
                  message: 'Welcome back. Continue from where you left off.',
                  rewardsPreserved: true,
                  preservedAcademyRewardEventIds: ['journal:before-break'],
              }
            : {
                  mode: 'continue',
                  missedDays: 0,
                  message: 'Continue when you are ready.',
                  rewardsPreserved: true,
                  preservedAcademyRewardEventIds: [],
              },
        motivation: {
            anticipation: { actionId: primaryAction.id, message: 'Begin here.' },
            competence: {
                basis: welcomeBack ? 'welcome-back' : 'ready',
                message: welcomeBack ? 'Everything already earned is still here.' : 'One step is enough.',
            },
            connection: null,
            closure: { afterActionId: primaryAction.id, message: 'Close when ready.' },
        },
    };
}
