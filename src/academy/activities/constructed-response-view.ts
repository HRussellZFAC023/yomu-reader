import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    GradeResult,
} from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';
import type { ConstructedResponseActivityModel } from './constructed-response';

export function renderConstructedResponse(
    model: ConstructedResponseActivityModel,
    host: ActivityHost,
    submit: (response: string) => Promise<ActivityEvaluation>,
    normalizeResponse: (response: string) => string,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-constructed-response';
    root.dataset.activityId = model.id;
    const { heading, japanese } = prompt(model, host);
    const form = document.createElement('form');
    form.className = 'academy-constructed-response-form';
    form.setAttribute('aria-labelledby', heading.id);
    const input = responseInput(model, host);
    const feedback = feedbackRegion(model);
    input.setAttribute('aria-describedby', feedback.id);
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-constructed-response-commit';
    commit.textContent = host.language === 'ja' ? '答える' : 'Answer';
    form.append(input, commit);
    root.append(heading, promptReadingSupport(model, host, japanese));
    root.append(form, feedback);
    host.react?.({ speakerId: 'rie', expression: 'neutral' });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const response = input.value;
        if (!normalizeResponse(response)) {
            const message = host.language === 'ja' ? '日本語で答えてください。' : 'Answer in Japanese.';
            feedback.replaceChildren(message);
            host.announce(message);
            input.focus();
            return;
        }
        setPending(form, true);
        feedback.replaceChildren();
        host.react?.({ speakerId: 'rie', expression: 'encouraging' });
        try {
            const evaluation = await submit(response);
            root.dataset.outcome = evaluation.result.outcome;
            showFeedback(feedback, evaluation.result, host.language ?? 'en');
            if (evaluation.result.outcome === 'pass') {
                host.react?.({ speakerId: 'rie', expression: 'happy' });
                input.disabled = true;
                commit.disabled = true;
            } else {
                host.react?.({ speakerId: 'rie', expression: 'repair' });
                setPending(form, false);
                input.focus();
                input.select();
            }
            host.announce(localized(evaluation.result.feedback.explanation, host.language ?? 'en'));
        } catch (error) {
            setPending(form, false);
            host.react?.({ speakerId: 'rie', expression: 'neutral' });
            const message = error instanceof Error ? error.message : String(error);
            feedback.replaceChildren(message);
            host.announce(message);
        }
    }, { signal: lifecycle.signal });

    host.replace(root);
    return {
        focus() { input.focus(); },
        dispose() {
            lifecycle.abort();
            host.react?.({ speakerId: 'rie', expression: 'neutral' });
            root.remove();
        },
    };
}

function prompt(
    model: ConstructedResponseActivityModel,
    host: ActivityHost,
): { readonly heading: HTMLHeadingElement; readonly japanese: HTMLSpanElement } {
    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    const japanese = document.createElement('span');
    japanese.className = 'academy-japanese academy-constructed-response-prompt';
    japanese.lang = 'ja';
    japanese.dataset.jpdbReaderSurfaceIgnore = '';
    japanese.textContent = model.prompt.ja;
    heading.append(japanese);
    if (host.language !== 'ja') {
        const english = document.createElement('span');
        english.className = 'academy-support academy-constructed-response-support';
        english.lang = 'en';
        english.dataset.jpdbReaderSurfaceIgnore = '';
        english.textContent = model.prompt.en;
        heading.append(english);
    }
    return { heading, japanese };
}

function responseInput(model: ConstructedResponseActivityModel, host: ActivityHost): HTMLInputElement {
    const input = document.createElement('input');
    input.className = 'academy-constructed-response-input';
    input.type = 'text';
    input.lang = 'ja';
    input.inputMode = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.enterKeyHint = 'send';
    input.setAttribute('aria-label', host.language === 'ja' ? '日本語で答える' : 'Answer in Japanese');
    input.dataset.responseKind = model.responseKind;
    return input;
}

function feedbackRegion(model: ConstructedResponseActivityModel): HTMLDivElement {
    const feedback = document.createElement('div');
    feedback.id = `${model.id}-feedback`;
    feedback.className = 'academy-constructed-response-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    return feedback;
}

function promptReadingSupport(
    model: ConstructedResponseActivityModel,
    host: ActivityHost,
    japanese: HTMLSpanElement,
): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-constructed-prompt-support';
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'academy-constructed-prompt-support-toggle';
    reveal.textContent = host.language === 'ja' ? '読み方' : 'Readings';
    reveal.setAttribute('aria-pressed', 'false');
    let recorded = false;
    reveal.addEventListener('click', () => {
        const visible = reveal.getAttribute('aria-pressed') !== 'true';
        reveal.setAttribute('aria-pressed', String(visible));
        reveal.textContent = visible
            ? (host.language === 'ja' ? '読み方を隠す' : 'Hide readings')
            : (host.language === 'ja' ? '読み方' : 'Readings');
        japanese.textContent = model.prompt.ja;
        if (visible) {
            delete japanese.dataset.jpdbReaderSurfaceIgnore;
            japanese.dataset.yomuRuntimeSurface = 'academy-activity';
            japanese.dataset.yomuFuriganaMode = 'all';
        } else {
            japanese.dataset.jpdbReaderSurfaceIgnore = '';
            delete japanese.dataset.yomuRuntimeSurface;
            delete japanese.dataset.yomuFuriganaMode;
        }
        japanese.dispatchEvent(new CustomEvent('academy:annotation-change', {
            bubbles: true,
            detail: { visible },
        }));
        if (visible && !recorded) {
            recorded = true;
            void host.recordSupportUse?.({ activityId: model.id, supportKind: 'hint', choiceId: 'prompt-reading' });
        }
    });
    root.append(reveal);
    return root;
}

function showFeedback(root: HTMLElement, result: GradeResult, language: 'en' | 'ja'): void {
    root.replaceChildren(feedbackLine(result.feedback.explanation, language, 'academy-constructed-feedback-contrast'));
    if (result.outcome === 'lapse' && result.feedback.repairPrompt) {
        root.append(feedbackLine(result.feedback.repairPrompt, language, 'academy-constructed-feedback-repair'));
    }
    if (result.outcome === 'lapse' && result.feedback.nearbyExample) {
        root.append(feedbackLine(result.feedback.nearbyExample, language, 'academy-constructed-feedback-example'));
    }
}

function feedbackLine(value: LocalizedText, language: 'en' | 'ja', className: string): HTMLParagraphElement {
    const line = document.createElement('p');
    line.className = className;
    line.lang = language;
    line.textContent = localized(value, language);
    return line;
}

function localized(value: LocalizedText, language: 'en' | 'ja'): string {
    return language === 'ja' ? value.ja : value.en;
}

function setPending(form: HTMLFormElement, pending: boolean): void {
    form.setAttribute('aria-busy', String(pending));
    form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach(control => {
        control.disabled = pending;
    });
}
