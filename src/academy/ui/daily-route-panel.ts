import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { DailyLearningRoute, DailyRouteAction } from '../domain/daily-learning-loop';
import { element } from './dom';

export interface DailyRoutePanelOptions {
    readonly language: AcademyLanguage;
    readonly route: DailyLearningRoute;
    readonly learningReason?: string;
    readonly onOpenAction: (action: DailyRouteAction) => void;
}

export function renderDailyRoutePanel(options: DailyRoutePanelOptions): HTMLElement {
    const panel = element('section', 'academy-daily-route');
    panel.dataset.dailyRoute = 'true';
    const heading = element('div', 'academy-daily-route-heading');
    const eyebrow = element('span', 'academy-daily-route-eyebrow');
    eyebrow.textContent = options.language === 'ja' ? '今日の続き' : "Today's thread";
    const title = element('h3', 'academy-daily-route-title');
    title.textContent = options.language === 'ja' ? '一つずつ、物語の先へ。' : 'One clear step, then the story moves.';
    heading.append(eyebrow, title);

    const context = element('div', 'academy-daily-route-context');
    if (options.route.recovery.mode === 'welcome-back') {
        const recovery = element('p', 'academy-daily-route-recovery');
        recovery.textContent = options.language === 'ja' ? 'おかえりなさい。前の続きから始められます。' : 'Welcome back. Everything you earned is still here.';
        context.append(recovery);
    } else {
        const competence = element('p', 'academy-daily-route-competence');
        competence.textContent = competenceCue(options.route, options.language);
        context.append(competence);
    }
    if (options.learningReason?.trim()) {
        const reason = element('p', 'academy-daily-route-reason');
        reason.textContent = options.language === 'ja' ? `学ぶ理由：${options.learningReason.trim()}` : `Your reason: ${options.learningReason.trim()}`;
        context.append(reason);
    }

    const actions = element('div', 'academy-daily-route-actions');
    actions.append(actionButton(options.route.primaryAction, options, true));
    options.route.supportingActions.forEach((action) => actions.append(actionButton(action, options, false)));
    panel.append(heading, context, actions);
    return panel;
}

function actionButton(action: DailyRouteAction, options: DailyRoutePanelOptions, primary: boolean): HTMLButtonElement {
    const button = element('button', `academy-daily-route-action${primary ? ' is-primary' : ''}`);
    button.type = 'button';
    button.dataset.dailyActionId = action.id;
    button.dataset.dailyActionKind = action.kind;
    button.dataset.incentiveKind = action.incentive.kind;
    const cue = element('span', 'academy-daily-route-action-cue');
    cue.textContent = actionCue(action, options.language, primary);
    const label = element('strong', 'academy-daily-route-action-label');
    label.textContent = action.kind === 'repair' ? (options.language === 'ja' ? '復習する' : 'Repair due memories') : action.label;
    const payoff = element('span', 'academy-daily-route-action-payoff');
    payoff.textContent = incentiveCue(action, options.language);
    const arrow = element('span', 'academy-daily-route-action-arrow');
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(cue, label, payoff, arrow);
    button.addEventListener('click', () => options.onOpenAction(action));
    return button;
}

function actionCue(action: DailyRouteAction, language: AcademyLanguage, primary: boolean): string {
    if (primary) return language === 'ja' ? 'まず' : 'Begin here';
    if (action.kind === 'lesson') return language === 'ja' ? '次の授業' : 'Next class';
    if (action.kind === 'repair') return language === 'ja' ? '記憶を直す' : 'Memory repair';
    return action.encounterKind === 'bond' ? (language === 'ja' ? '誰かとの続き' : 'Relationship thread') : language === 'ja' ? '新しい場所へ' : 'World thread';
}

function competenceCue(route: DailyLearningRoute, language: AcademyLanguage): string {
    if (route.motivation.competence.basis === 'verified-practice') {
        return language === 'ja' ? '前に身につけたことが、今日の一歩につながります。' : 'What you proved before carries into this step.';
    }
    if (route.motivation.competence.basis === 'n-plus-one') {
        return language === 'ja' ? '分かる日本語を土台に、一つだけ先へ。' : 'Build on Japanese you know, with one new step.';
    }
    return language === 'ja' ? '今日は一つ終えれば、十分な前進です。' : 'One completed step is enough progress for today.';
}

function incentiveCue(action: DailyRouteAction, language: AcademyLanguage): string {
    if (action.incentive.kind === 'journal-memory') {
        return language === 'ja' ? '日誌に記憶が残ります' : 'A memory stays in your journal';
    }
    if (action.incentive.kind === 'bond-scene') {
        return language === 'ja' ? '誰かとの物語が続きます' : "Someone's story continues";
    }
    if (action.incentive.kind === 'place-discovery') {
        return language === 'ja' ? '場所の新しい一面へ' : 'Discover another side of this place';
    }
    return language === 'ja' ? '新しい資料が開きます' : 'A new source opens';
}
