import type {
    ActivityController,
    ActivityEvaluation,
    ActivityHost,
    FeedbackBlock,
    GradeResult,
} from '../domain/activity-runtime';
import {
    progressiveHintChoiceId,
    remainingBeginnerHintTiers,
} from '../domain/learner-support';
import type { LocalizedText } from '../domain/source-library';
import type { ConstructedResponseActivityModel } from './constructed-response';
import { setAcademyTooltip } from '../ui/tooltip';

interface ProgressiveHintItem {
    readonly text: LocalizedText;
    readonly choiceId: string;
    readonly className: string;
    readonly bilingual?: boolean;
    readonly fillResponse?: string;
    readonly vocabulary?: readonly { readonly expression: string; readonly reading: string; readonly meaning: LocalizedText }[];
    readonly scaffold?: LocalizedText;
}

interface ProgressiveHintController {
    readonly element: HTMLElement;
    suspend(): void;
    resume(): void;
    unlock(feedback: FeedbackBlock): void;
}

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
    const hints = progressiveHints(model, host, input);
    input.setAttribute('aria-describedby', feedback.id);
    const commit = document.createElement('button');
    commit.type = 'submit';
    commit.className = 'academy-constructed-response-commit';
    commit.textContent = host.language === 'ja' ? '答える' : 'Answer';
    form.append(input, commit);
    const readingSupport = promptReadingSupport(model, host, japanese);
    root.append(heading);
    if (readingSupport.element) root.append(readingSupport.element);
    root.append(form, feedback, hints.element);
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
        hints.suspend();
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
                hints.unlock(evaluation.result.feedback);
                host.react?.({ speakerId: 'rie', expression: 'repair' });
                setPending(form, false);
                input.focus();
                input.select();
            }
            const explanation = localized(evaluation.result.feedback.explanation, host.language ?? 'en');
            const hintAvailability = evaluation.result.outcome === 'lapse'
                ? (host.language === 'ja' ? ' ヒントが使えます。' : ' Hint support is now available.')
                : '';
            host.announce(`${explanation}${hintAvailability}`);
        } catch (error) {
            hints.resume();
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
            readingSupport.dispose();
            host.react?.({ speakerId: 'rie', expression: 'neutral' });
            root.remove();
        },
    };
}

function progressiveHints(
    model: ConstructedResponseActivityModel,
    host: ActivityHost,
    input: HTMLInputElement,
): ProgressiveHintController {
    const root = document.createElement('section');
    root.className = 'academy-progressive-hints academy-lesson-repair-hints';
    root.hidden = true;
    const revealed = document.createElement('div');
    revealed.className = 'academy-progressive-hints-revealed';
    revealed.setAttribute('aria-live', 'polite');
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'academy-progressive-hint-button';
    let items: readonly ProgressiveHintItem[] = [];
    let index = 0;
    let unlocked = false;
    const updateLabel = (): void => {
        reveal.textContent = host.language === 'ja'
            ? (index === 0 ? 'ヒントを見る' : '次のヒント')
            : (index === 0 ? 'Need a hint?' : 'Another hint');
    };
    updateLabel();
    reveal.addEventListener('click', event => {
        if (!unlocked) return;
        const hint = items[index];
        if (!hint) return;
        const line = document.createElement('p');
        line.className = hint.className;
        appendHintText(line, hint, host.language ?? 'en');
        revealed.append(line);
        if (hint.vocabulary) revealed.append(vocabularyHintList(hint.vocabulary, host.language ?? 'en'));
        if (hint.scaffold) revealed.append(scaffoldHint(hint.scaffold, host.language ?? 'en'));
        let fill: HTMLButtonElement | undefined;
        if (hint.fillResponse) {
            fill = document.createElement('button');
            fill.type = 'button';
            fill.className = 'academy-progressive-hint-fill';
            fill.textContent = host.language === 'ja' ? 'この答えを使う' : 'Use this answer';
            fill.addEventListener('click', () => {
                input.value = hint.fillResponse ?? '';
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            });
            revealed.append(fill);
        }
        void host.recordSupportUse?.({
            activityId: model.id,
            supportKind: 'hint',
            choiceId: hint.choiceId,
        });
        index += 1;
        if (index >= items.length) {
            reveal.remove();
            if (event.detail === 0) (fill ?? input).focus();
        } else updateLabel();
    });
    root.append(revealed, reveal);
    const suspend = (): void => {
        unlocked = false;
        root.hidden = true;
    };
    return {
        element: root,
        suspend,
        resume() {
            unlocked = items.length > 0;
            root.hidden = !unlocked;
        },
        unlock(feedback) {
            items = progressiveHintItems(model, feedback, host.learnerSupportUses);
            revealed.replaceChildren();
            root.replaceChildren(revealed, reveal);
            index = 0;
            unlocked = items.length > 0;
            root.hidden = !unlocked;
            updateLabel();
        },
    };
}

function progressiveHintItems(
    model: ConstructedResponseActivityModel,
    feedback: FeedbackBlock,
    learnerSupportUses: ActivityHost['learnerSupportUses'],
): readonly ProgressiveHintItem[] {
    const tiered = model.payload.hints?.every(hint => hint.tier !== undefined);
    if (tiered && model.payload.hints) {
        const byTier = new Map(model.payload.hints.map(hint => [hint.tier!, hint]));
        return remainingBeginnerHintTiers(model.id, learnerSupportUses).flatMap(tier => {
            const hint = byTier.get(tier);
            if (!hint) return [];
            return [{
                text: hint.text,
                choiceId: progressiveHintChoiceId(tier),
                className: `academy-progressive-hint academy-progressive-hint-${tier}`,
                ...(hint.vocabulary ? { vocabulary: hint.vocabulary } : {}),
                ...(hint.scaffold ? { scaffold: hint.scaffold } : {}),
            }];
        });
    }
    const authored = (model.payload.hints ?? []).map((hint, index): ProgressiveHintItem => ({
        text: hint.text,
        choiceId: `progressive-hint:${index + 1}`,
        className: 'academy-progressive-hint',
        ...(hint.fillResponse ? { fillResponse: hint.fillResponse } : {}),
    }));
    const responseSpecific: ProgressiveHintItem[] = [];
    if (feedback.repairPrompt) responseSpecific.push({
        text: feedback.repairPrompt,
        choiceId: 'progressive-repair:1',
        className: 'academy-constructed-feedback-repair',
        bilingual: true,
    });
    if (feedback.nearbyExample) responseSpecific.push({
        text: feedback.nearbyExample,
        choiceId: 'progressive-repair:2',
        className: 'academy-constructed-feedback-example',
        bilingual: true,
    });

    const byText = new Map<string, ProgressiveHintItem>();
    for (const item of [...authored.filter(hint => !hint.fillResponse), ...responseSpecific, ...authored.filter(hint => hint.fillResponse)]) {
        const key = `${item.text.ja}\u0000${item.text.en}`;
        const existing = byText.get(key);
        if (!existing) {
            byText.set(key, item);
            continue;
        }
        if (item.fillResponse) byText.set(key, { ...existing, choiceId: item.choiceId, fillResponse: item.fillResponse });
    }
    return [...byText.values()].sort((left, right) => Number(Boolean(left.fillResponse)) - Number(Boolean(right.fillResponse)));
}

function appendHintText(
    line: HTMLParagraphElement,
    hint: ProgressiveHintItem,
    language: 'en' | 'ja',
): void {
    if (!hint.bilingual) {
        line.lang = language;
        line.textContent = localized(hint.text, language);
        return;
    }
    const japanese = document.createElement('span');
    japanese.className = 'academy-japanese';
    japanese.lang = 'ja';
    japanese.textContent = hint.text.ja;
    const translation = document.createElement('span');
    translation.className = 'academy-support';
    translation.lang = 'en';
    translation.dataset.jpdbReaderSurfaceIgnore = '';
    translation.textContent = hint.text.en;
    line.append(japanese, translation);
}

function vocabularyHintList(
    vocabulary: NonNullable<ProgressiveHintItem['vocabulary']>,
    language: 'en' | 'ja',
): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'academy-progressive-hint-vocabulary';
    for (const cue of vocabulary) {
        const item = document.createElement('li');
        item.lang = 'ja';
        item.textContent = `${cue.expression} (${cue.reading})`;
        if (language !== 'ja') {
            const meaning = document.createElement('span');
            meaning.className = 'academy-support';
            meaning.lang = 'en';
            meaning.textContent = cue.meaning.en;
            item.append(meaning);
        }
        list.append(item);
    }
    return list;
}

function scaffoldHint(scaffold: LocalizedText, language: 'en' | 'ja'): HTMLParagraphElement {
    const line = document.createElement('p');
    line.className = 'academy-progressive-hint-scaffold';
    line.lang = language;
    line.textContent = localized(scaffold, language);
    return line;
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
): { readonly element: HTMLElement | null; readonly dispose: () => void } {
    if (host.registerReadingSurface) {
        return { element: null, dispose: host.registerReadingSurface(japanese) };
    }
    const root = document.createElement('div');
    root.className = 'academy-constructed-prompt-support';
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'academy-constructed-prompt-support-toggle';
    reveal.textContent = '読';
    reveal.setAttribute('aria-pressed', 'false');
    reveal.dataset.jpdbReaderSurfaceIgnore = '';
    const setLabel = (visible: boolean): void => {
        const label = host.language === 'ja'
            ? (visible ? '読み方を隠す' : '読み方を見る')
            : (visible ? 'Hide readings' : 'Show readings');
        setAcademyTooltip(reveal, label);
    };
    setLabel(false);
    let recorded = false;
    reveal.addEventListener('click', () => {
        const visible = reveal.getAttribute('aria-pressed') !== 'true';
        reveal.setAttribute('aria-pressed', String(visible));
        setLabel(visible);
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
    return { element: root, dispose: () => undefined };
}

function showFeedback(
    root: HTMLElement,
    result: GradeResult,
    language: 'en' | 'ja',
): void {
    root.replaceChildren(feedbackLine(result.feedback.explanation, language, 'academy-constructed-feedback-contrast'));
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
