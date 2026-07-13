import {
    type ActivityController,
    type ActivityEvaluation,
    type ActivityHost,
    type ActivityModel,
    type ActivityPlugin,
    type ReviewSeed,
    type ValidationIssue,
} from '../domain/activity-runtime';
import type { LocalizedText } from '../domain/source-library';

export interface ChoiceOption {
    readonly id: string;
    readonly label: LocalizedText;
    readonly correct: boolean;
    readonly errorTag?: string;
    readonly explanation: LocalizedText;
    readonly repairPrompt?: LocalizedText;
    readonly nearbyExample?: LocalizedText;
    readonly readingHint?: {
        readonly reading: string;
        readonly pitch: string;
    };
}

export interface ChoiceActivityPayload {
    readonly options: readonly ChoiceOption[];
    readonly reviewSeedId: string;
    readonly reviewContent: ReviewSeed['content'];
}

export interface ChoiceActivityModel extends ActivityModel {
    readonly kind: 'choice';
    readonly responseKind: 'choice';
    readonly payload: ChoiceActivityPayload;
}

export const choiceActivityPlugin: ActivityPlugin<ChoiceActivityModel, string> = {
    kind: 'choice',
    validate: validateChoice,
    render: renderChoice,
    grade(model, response) {
        const option = model.payload.options.find(candidate => candidate.id === response);
        if (!option) throw new TypeError(`Unknown choice response: ${String(response)}`);
        return {
            outcome: option.correct ? 'pass' : 'lapse',
            score: option.correct ? 1 : 0,
            errorTags: option.errorTag ? [option.errorTag] : [],
            feedback: {
                explanation: option.explanation,
                ...(option.repairPrompt ? { repairPrompt: option.repairPrompt } : {}),
                ...(option.nearbyExample ? { nearbyExample: option.nearbyExample } : {}),
            },
        };
    },
    toReviewSeeds(model, result): readonly ReviewSeed[] {
        return model.conceptIds.map(conceptId => ({
            id: `${model.payload.reviewSeedId}:${conceptId}`,
            conceptId,
            reason: result.outcome === 'lapse' ? 'repair' : 'new-learning',
            ...(model.sourceQuestionId ? { sourceQuestionId: model.sourceQuestionId } : {}),
            content: model.payload.reviewContent,
        }));
    },
};

function validateChoice(model: ChoiceActivityModel): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!Array.isArray(model.payload?.options) || model.payload.options.length < 2) {
        issues.push({ path: 'payload.options', message: 'At least two choices are required.' });
        return issues;
    }
    const ids = new Set<string>();
    let correct = 0;
    for (const [index, option] of model.payload.options.entries()) {
        if (!option.id.trim()) issues.push({ path: `payload.options.${index}.id`, message: 'A stable id is required.' });
        if (ids.has(option.id)) issues.push({ path: `payload.options.${index}.id`, message: 'Choice ids must be unique.' });
        ids.add(option.id);
        if (option.correct) correct += 1;
        if (!option.label.en.trim() || !option.label.ja.trim()) {
            issues.push({ path: `payload.options.${index}.label`, message: 'English and Japanese labels are required.' });
        }
        if (!option.explanation.en.trim() || !option.explanation.ja.trim()) {
            issues.push({ path: `payload.options.${index}.explanation`, message: 'Bilingual feedback is required.' });
        }
        if (option.readingHint && (!option.readingHint.reading.trim() || !option.readingHint.pitch.trim())) {
            issues.push({ path: `payload.options.${index}.readingHint`, message: 'Reading support needs a reading and pitch pattern.' });
        }
        if (!option.correct && (!option.repairPrompt?.en.trim() || !option.repairPrompt.ja.trim()
            || !option.nearbyExample?.en.trim() || !option.nearbyExample.ja.trim())) {
            issues.push({ path: `payload.options.${index}`, message: 'Wrong choices need a bilingual repair and nearby example.' });
        }
    }
    if (correct !== 1) issues.push({ path: 'payload.options', message: 'Exactly one choice must be correct.' });
    if (!model.payload.reviewSeedId?.trim()) issues.push({ path: 'payload.reviewSeedId', message: 'A review seed id is required.' });
    if (!model.payload.reviewContent?.expression.trim() || !model.payload.reviewContent.meanings.length) {
        issues.push({ path: 'payload.reviewContent', message: 'Reviewable expression and meaning are required.' });
    }
    return issues;
}

function renderChoice(
    model: ChoiceActivityModel,
    host: ActivityHost,
    submit: (response: string) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const root = document.createElement('section');
    root.className = 'academy-activity academy-choice-activity';
    root.dataset.activityId = model.id;
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    heading.append(japanese(model.prompt.ja), support(model.prompt.en));
    const choices = document.createElement('div');
    choices.className = 'academy-choice-options';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', model.prompt.ja);
    heading.id = `${model.id}-prompt`;
    const feedback = document.createElement('div');
    feedback.className = 'academy-activity-feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    host.react?.({ speakerId: 'rie', expression: 'neutral' });

    for (const option of model.payload.options) {
        const row = document.createElement('div');
        row.className = 'academy-choice-row';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'academy-choice-option';
        button.dataset.choiceId = option.id;
        button.setAttribute('aria-label', option.label.ja);
        button.append(assessedJapanese(option.label.ja));
        button.addEventListener('click', async () => {
            setDisabled(choices, true);
            host.react?.({ speakerId: 'rie', expression: 'encouraging' });
            try {
                const evaluation = await submit(option.id);
                root.dataset.outcome = evaluation.result.outcome;
                host.react?.({
                    speakerId: 'rie',
                    expression: evaluation.result.outcome === 'pass' ? 'happy' : 'repair',
                });
                feedback.removeAttribute('aria-label');
                showFeedback(feedback, evaluation);
                host.announce([
                    evaluation.result.feedback.explanation.ja,
                    evaluation.result.feedback.explanation.en,
                ].join(' / '));
                if (evaluation.result.outcome === 'lapse') setDisabled(choices, false);
            } catch (error) {
                setDisabled(choices, false);
                host.react?.({ speakerId: 'rie', expression: 'neutral' });
                host.announce(error instanceof Error ? error.message : String(error));
            }
        }, { signal: lifecycle.signal });
        row.append(button);
        if (option.readingHint) row.append(readingSupport(model, option, host));
        choices.append(row);
    }
    root.append(heading, choices, feedback);
    host.replace(root);
    return {
        focus() {
            heading.focus();
        },
        dispose() {
            lifecycle.abort();
            host.react?.({ speakerId: 'rie', expression: 'neutral' });
            root.remove();
        },
    };
}

function showFeedback(root: HTMLElement, evaluation: ActivityEvaluation): void {
    const { feedback } = evaluation.result;
    root.replaceChildren(localizedParagraph(feedback.explanation, 'academy-feedback-explanation'));
    if (feedback.repairPrompt) root.append(localizedParagraph(feedback.repairPrompt, 'academy-feedback-repair'));
    if (feedback.nearbyExample) root.append(localizedParagraph(feedback.nearbyExample, 'academy-feedback-example'));
}

function localizedParagraph(value: LocalizedText, className: string): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.className = className;
    paragraph.append(japanese(value.ja), support(value.en));
    return paragraph;
}

function japanese(value: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'academy-japanese';
    span.lang = 'ja';
    span.dataset.yomuRuntimeSurface = 'academy-activity';
    span.dataset.yomuFuriganaMode = 'all';
    span.textContent = value;
    return span;
}

function assessedJapanese(value: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'academy-japanese academy-assessed-japanese';
    span.lang = 'ja';
    span.dataset.jpdbReaderSurfaceIgnore = '';
    span.textContent = value;
    return span;
}

function readingSupport(model: ChoiceActivityModel, option: ChoiceOption, host: ActivityHost): HTMLElement {
    const root = document.createElement('div');
    root.className = 'academy-choice-reading-support';
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'academy-choice-reading-toggle';
    reveal.textContent = host.language === 'ja' ? '読み方を見る' : 'Show readings';
    reveal.setAttribute('aria-expanded', 'false');
    const reading = document.createElement('p');
    reading.className = 'academy-choice-reading';
    reading.hidden = true;
    reading.lang = 'ja';
    reading.dataset.jpdbReaderSurfaceIgnore = '';
    const ruby = readingRuby(option.label.ja, option.readingHint!.reading);
    const pitch = document.createElement('span');
    pitch.className = 'academy-choice-pitch';
    pitch.textContent = ` · ${option.readingHint!.pitch}`;
    reading.append(ruby, pitch);
    let recorded = false;
    reveal.addEventListener('click', () => {
        reading.hidden = false;
        reveal.hidden = true;
        reveal.setAttribute('aria-expanded', 'true');
        if (recorded) return;
        recorded = true;
        void host.recordSupportUse?.({ activityId: model.id, supportKind: 'hint', choiceId: option.id });
    });
    root.append(reveal, reading);
    return root;
}

function readingRuby(label: string, reading: string): HTMLElement {
    const ruby = document.createElement('ruby');
    const open = document.createElement('rp');
    open.textContent = '(';
    const rt = document.createElement('rt');
    rt.textContent = reading;
    const close = document.createElement('rp');
    close.textContent = ')';
    ruby.append(label, open, rt, close);
    return ruby;
}

function support(value: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'academy-support';
    span.lang = 'en';
    span.dataset.jpdbReaderSurfaceIgnore = '';
    span.textContent = value;
    return span;
}

function setDisabled(root: ParentNode, disabled: boolean): void {
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = disabled; });
}
