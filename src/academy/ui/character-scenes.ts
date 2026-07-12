import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import { choiceActivityPlugin, type ChoiceActivityModel } from '../activities/choice';
import { createActivityRuntime, type ActivityEvaluation } from '../domain/activity-runtime';
import { copyButton, copyElement, element, screenFrame } from './dom';

export function renderRieUnlockScreen(language: AcademyLanguage, onContinue: () => void): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language,
        className: 'academy-character-unlock-screen academy-rie-unlock-screen',
        plate: 'classroom',
        eyebrow: 'rieUnlockEyebrow',
        title: 'rieUnlockTitle',
        body: 'rieUnlockBody',
    });
    panel.classList.add('academy-panel-with-character', 'academy-character-unlock-panel');
    const rie = element('img', 'academy-character academy-character-rie');
    rie.src = ACADEMY_ASSETS.rie;
    rie.alt = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    const bond = copyElement('p', 'academy-bond-stars academy-unlock-star', language, 'bondFirstStar');
    const next = copyButton(language, 'rieUnlockContinue', 'academy-button academy-button-primary');
    next.addEventListener('click', onContinue);
    content.append(bond, next);
    panel.prepend(rie);
    return screen;
}

export interface AakashMeetScreenOptions {
    readonly language: AcademyLanguage;
    readonly activity: ChoiceActivityModel;
    readonly completed: boolean;
    readonly onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>;
    readonly onContinue: () => void;
}

export function renderAakashMeetScreen(options: AakashMeetScreenOptions): HTMLElement {
    const { screen, panel, content } = screenFrame({
        language: options.language,
        className: 'academy-aakash-screen',
        plate: 'rainyDirections',
        eyebrow: 'aakashMeetEyebrow',
        title: 'aakashMeetTitle',
        body: 'aakashMeetBody',
    });
    panel.classList.add('academy-aakash-panel');
    const cast = element('img', 'academy-aakash-cg');
    cast.src = ACADEMY_ASSETS.events.rainyDirections;
    cast.alt = options.language === 'ja'
        ? '赤い傘の下のりえ先生とアーカーシュ'
        : 'Rie-sensei and Aakash under a red umbrella';
    const activityHost = element('div', 'academy-activity-host');
    const completion = element('div', 'academy-source-completion');
    content.append(cast, activityHost, completion);
    if (options.completed) {
        showAakashUnlock(options.language, activityHost, completion, options.onContinue);
        return screen;
    }

    const runtime = createActivityRuntime([choiceActivityPlugin]);
    const controller = runtime.mount(options.activity, {
        replace(view) { activityHost.replaceChildren(view); },
        announce(message) {
            const live = activityHost.querySelector<HTMLElement>('[role="status"]');
            if (live) live.setAttribute('aria-label', message);
        },
    }, async evaluation => {
        await options.onEvaluation(evaluation);
        if (evaluation.result.outcome === 'pass') {
            showAakashUnlock(options.language, activityHost, completion, options.onContinue);
        }
    });
    screen.addEventListener('academy:dispose', () => controller.dispose(), { once: true });
    return screen;
}

export function renderAakashMemory(language: AcademyLanguage, onReturn: () => void): HTMLElement {
    const { screen, content } = screenFrame({
        language,
        className: 'academy-aakash-memory-screen',
        plate: 'rainyDirections',
        eyebrow: 'aakashMeetEyebrow',
        title: 'aakashMemoryTitle',
        body: 'aakashMemoryBody',
    });
    const cast = element('img', 'academy-aakash-cg');
    cast.src = ACADEMY_ASSETS.events.rainyDirections;
    cast.alt = language === 'ja'
        ? '赤い傘の下のりえ先生とアーカーシュ'
        : 'Rie-sensei and Aakash under a red umbrella';
    const line = element('blockquote', 'academy-memory-line academy-memory-line-japanese');
    line.lang = 'ja';
    line.dataset.yomuRuntimeSurface = 'aakash-memory-line';
    line.textContent = 'この道をまっすぐ行って、右です。';
    const close = copyButton(language, 'aakashMemoryReturn', 'academy-button academy-button-primary');
    close.addEventListener('click', onReturn);
    content.append(cast, line, close);
    return screen;
}

function showAakashUnlock(
    language: AcademyLanguage,
    activityHost: HTMLElement,
    completion: HTMLElement,
    onContinue: () => void,
): void {
    activityHost.replaceChildren();
    const card = element('section', 'academy-character-unlock-card');
    card.append(
        copyElement('p', 'academy-eyebrow', language, 'aakashUnlockEyebrow'),
        copyElement('h2', 'academy-unlock-name', language, 'aakashUnlockTitle'),
        copyElement('blockquote', 'academy-unlock-line', language, 'aakashUnlockLine'),
        copyElement('p', 'academy-bond-stars academy-unlock-star', language, 'bondFirstStar'),
    );
    const next = copyButton(language, 'aakashContinue', 'academy-button academy-button-primary');
    next.addEventListener('click', onContinue);
    completion.replaceChildren(card, next);
}
