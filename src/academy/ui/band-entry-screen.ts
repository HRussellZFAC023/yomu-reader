import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { choiceActivityPlugin, type ChoiceActivityModel } from '../activities/choice';
import { createActivityRuntime, type ActivityEvaluation } from '../domain/activity-runtime';
import type { JlptBand } from '../domain/learner-record';
import { copyButton, copyElement, element, screenFrame } from './dom';

export interface BandEntryScreenOptions {
    readonly language: AcademyLanguage;
    readonly band: JlptBand;
    readonly activity: ChoiceActivityModel;
    readonly completed: boolean;
    readonly onEvaluation: (evaluation: ActivityEvaluation) => void | Promise<void>;
    readonly onContinue: () => void;
}

export function renderBandEntryScreen(options: BandEntryScreenOptions): HTMLElement {
    const { screen, content } = screenFrame({
        language: options.language,
        className: 'academy-band-entry-screen',
        plate: 'classroom',
        eyebrow: 'bandEntryEyebrow',
        title: 'bandEntryTitle',
        body: 'bandEntryBody',
    });
    const band = element('strong', 'academy-band-badge');
    band.textContent = options.band.toUpperCase();
    const activityHost = element('div', 'academy-activity-host');
    const completion = element('div', 'academy-source-completion');
    content.append(band, activityHost, completion);

    if (options.completed) {
        showCompletion(options.language, activityHost, completion, options.onContinue);
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
            showCompletion(options.language, activityHost, completion, options.onContinue);
        }
    });
    screen.addEventListener('academy:dispose', () => controller.dispose(), { once: true });
    return screen;
}

function showCompletion(
    language: AcademyLanguage,
    activityHost: HTMLElement,
    completion: HTMLElement,
    onContinue: () => void,
): void {
    activityHost.replaceChildren();
    const note = copyElement('p', 'academy-success-note', language, 'bandEntryComplete');
    const next = copyButton(language, 'bandEntryContinue', 'academy-button academy-button-primary');
    next.addEventListener('click', onContinue);
    completion.replaceChildren(note, next);
}
