import type { ActivityController, ActivityEvaluation, ActivityHost } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import { createPhraseKarutaSession } from './engine';
import type { PhraseKarutaModel, PhraseKarutaResponse } from './manifest';

export function renderPhraseKaruta(
    model: PhraseKarutaModel,
    host: ActivityHost,
    submit: (response: PhraseKarutaResponse) => Promise<ActivityEvaluation>,
): ActivityController {
    const lifecycle = new AbortController();
    const session = createPhraseKarutaSession(model);
    const root = document.createElement('section');
    root.className = 'academy-activity academy-phrase-karuta';
    root.dataset.activityId = model.id;

    const heading = document.createElement('h2');
    heading.id = `${model.id}-prompt`;
    heading.tabIndex = -1;
    heading.append(japanese(model.prompt.ja), support(model.prompt.en));
    const progress = document.createElement('p');
    progress.className = 'academy-phrase-karuta-progress';
    const cue = document.createElement('p');
    cue.className = 'academy-phrase-karuta-cue';
    cue.id = `${model.id}-cue`;
    const cardGrid = document.createElement('div');
    cardGrid.className = 'academy-phrase-karuta-grid';
    cardGrid.setAttribute('role', 'group');
    cardGrid.setAttribute('aria-labelledby', heading.id);
    cardGrid.setAttribute('aria-describedby', cue.id);
    const status = document.createElement('div');
    status.className = 'academy-phrase-karuta-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.append(heading, progress, cue, cardGrid, status);
    host.replace(root);

    let submitting = false;

    const submitCompleted = async (): Promise<void> => {
        if (submitting || lifecycle.signal.aborted) return;
        submitting = true;
        disableCards(cardGrid, true);
        status.replaceChildren(textParagraph(copy(host, 'Checking the deck…', '採点しています…')));
        try {
            const evaluation = await submit(session.response());
            if (lifecycle.signal.aborted) return;
            root.dataset.outcome = evaluation.result.outcome;
            showEvaluation(status, evaluation, host);
            host.announce(localized(evaluation.result.feedback.explanation, host));
        } catch (error) {
            if (lifecycle.signal.aborted) return;
            submitting = false;
            showSubmissionError(status, host, error, submitCompleted, lifecycle.signal);
        }
    };

    const choose = (cardId: string): void => {
        if (submitting || session.snapshot().complete) return;
        disableCards(cardGrid, true);
        const completedRound = session.snapshot().roundIndex + 1;
        const next = session.select(cardId);
        host.announce(copy(
            host,
            `Round ${completedRound} of ${next.totalRounds} recorded.`,
            `${next.totalRounds}問中${completedRound}問を記録しました。`,
        ));
        if (next.complete) void submitCompleted();
        else {
            renderRound();
            queueMicrotask(() => cardGrid.querySelector<HTMLButtonElement>('button')?.focus());
        }
    };

    const renderRound = (): void => {
        const snapshot = session.snapshot();
        const round = snapshot.round;
        if (!round) return;
        progress.textContent = copy(
            host,
            `Grab ${snapshot.roundIndex + 1} of ${snapshot.totalRounds}`,
            `${snapshot.totalRounds}問中${snapshot.roundIndex + 1}問`,
        );
        cue.replaceChildren(japanese(round.cue.ja), support(round.cue.en));
        cardGrid.replaceChildren(...model.payload.cards.map((card, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'academy-phrase-karuta-card';
            button.dataset.cardId = card.id;
            button.dataset.cardNumber = String(index + 1);
            button.setAttribute('aria-label', `${index + 1}. ${card.phrase}`);
            button.append(japanese(card.phrase));
            button.addEventListener('click', () => choose(card.id), { signal: lifecycle.signal });
            return button;
        }));
        cardGrid.onkeydown = event => handleGridKey(event, cardGrid);
        status.replaceChildren();
    };

    renderRound();
    return {
        focus() {
            heading.focus();
        },
        dispose() {
            lifecycle.abort();
            cardGrid.onkeydown = null;
            root.remove();
        },
    };
}

function handleGridKey(event: KeyboardEvent, grid: HTMLElement): void {
    const cards = [...grid.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!cards.length) return;
    const activeIndex = Math.max(0, cards.indexOf(document.activeElement as HTMLButtonElement));
    let target: HTMLButtonElement | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') target = cards[(activeIndex + 1) % cards.length];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') target = cards[(activeIndex - 1 + cards.length) % cards.length];
    else if (event.key === 'Home') target = cards[0];
    else if (event.key === 'End') target = cards.at(-1);
    else if (/^[1-9]$/.test(event.key)) target = cards[Number(event.key) - 1];
    else if (event.key === 'Enter' || event.key === ' ') target = cards[activeIndex];
    if (!target) return;
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ' || /^[1-9]$/.test(event.key)) target.click();
    else target.focus();
}

function showEvaluation(root: HTMLElement, evaluation: ActivityEvaluation, host: ActivityHost): void {
    const score = Math.round(evaluation.result.score * 100);
    const scoreLine = textParagraph(copy(host, `Score: ${score}%`, `スコア：${score}%`));
    scoreLine.className = 'academy-phrase-karuta-score';
    const explanation = localizedParagraph(evaluation.result.feedback.explanation);
    root.replaceChildren(scoreLine, explanation);
    if (evaluation.result.feedback.repairPrompt) {
        root.append(localizedParagraph(evaluation.result.feedback.repairPrompt));
    }
    if (evaluation.result.feedback.nearbyExample) {
        root.append(localizedParagraph(evaluation.result.feedback.nearbyExample));
    }
}

function showSubmissionError(
    root: HTMLElement,
    host: ActivityHost,
    error: unknown,
    retry: () => Promise<void>,
    signal: AbortSignal,
): void {
    const message = error instanceof Error ? error.message : String(error);
    const paragraph = textParagraph(message);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-phrase-karuta-retry';
    button.textContent = copy(host, 'Try submitting again', 'もう一度送信する');
    button.addEventListener('click', () => void retry(), { signal });
    root.replaceChildren(paragraph, button);
    host.announce(message);
}

function localizedParagraph(value: LocalizedText): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.append(japanese(value.ja), support(value.en));
    return paragraph;
}

function textParagraph(value: string): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    return paragraph;
}

function japanese(value: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'academy-japanese';
    span.lang = 'ja';
    span.dataset.jpdbReaderSurfaceIgnore = '';
    span.textContent = value;
    return span;
}

function support(value: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'academy-support';
    span.textContent = value;
    return span;
}

function disableCards(root: HTMLElement, disabled: boolean): void {
    root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = disabled; });
}

function localized(value: LocalizedText, host: ActivityHost): string {
    return host.language === 'ja' ? value.ja : value.en;
}

function copy(host: ActivityHost, en: string, ja: string): string {
    return host.language === 'ja' ? ja : en;
}
