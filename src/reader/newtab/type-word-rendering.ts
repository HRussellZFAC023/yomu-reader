import type { UiCopyKey } from '../app/i18n';
import type { InterfaceLanguage, NewTabTypeWordInputMode } from '../app/types';
import { el } from '../dom/builder';
import { isolate } from '../locales/direction';
import { targetCanHandwriteCharacter, targetCanHandwriteText } from '../languages/character-lookup';
import type { LearningTargetModule, TextDirection } from '../languages/types';
import { installKanjiDoodle } from '../kanji/doodle';
import type { NewTabCopyKey } from './i18n';
import { newTabAction, newTabActionSelector } from './actions';
import type { NewTabRecallOutcome } from './recall-practice';

type TypeWordText = (key: UiCopyKey | NewTabCopyKey) => string;

export interface TypeWordSelfCheckState {
    answer?: string;
    /** Latest learner assessment; retries may change this without laundering the first outcome. */
    feedback?: NewTabRecallOutcome;
    /** Generic handwriting is learner-checked; never an invented stroke score. */
    selfCheckRevealed?: boolean;
}

export type TypeWordSelfCheckAction = 'reveal' | 'match' | 'retry';

export type TypeWordSelfCheckTransition =
    | { kind: 'idle' }
    | { kind: 'navigate' }
    | {
        kind: 'update';
        state: TypeWordSelfCheckState;
        outcome?: 'correct' | 'incorrect';
    };

export function applyTypeWordSelfCheckAction(
    state: TypeWordSelfCheckState = {},
    action: TypeWordSelfCheckAction,
): TypeWordSelfCheckTransition {
    if (action === 'reveal') return { kind: 'update', state: { ...state, selfCheckRevealed: true } };
    if (action === 'retry') return selfCheckAssessment(state, 'incorrect', false);
    if (state.feedback === 'correct') return { kind: 'navigate' };
    return selfCheckAssessment(state, 'correct', true);
}

function selfCheckAssessment(
    state: Readonly<TypeWordSelfCheckState>,
    outcome: 'correct' | 'incorrect',
    selfCheckRevealed: boolean,
): TypeWordSelfCheckTransition {
    if (!state.selfCheckRevealed) return { kind: 'idle' };
    return {
        kind: 'update',
        state: { ...state, feedback: outcome, selfCheckRevealed },
        outcome,
    };
}

export function nextTypeWordHandwritingIndex(chars: string[], start: number): number {
    const relative = chars.slice(start).findIndex(targetCanHandwriteCharacter);
    return relative < 0 ? chars.length : start + relative;
}

function resolveTypeWordAnswerMode(
    configured: NewTabTypeWordInputMode,
    supportsHandwriting: boolean,
): NewTabTypeWordInputMode {
    if (configured !== 'handwriting') return 'keyboard';
    return supportsHandwriting ? 'handwriting' : 'keyboard';
}

export function mountTypeWordAnswer(options: {
    root: HTMLElement | null;
    configuredMode: NewTabTypeWordInputMode;
    supportsHandwriting: boolean;
    state?: TypeWordSelfCheckState;
    targetText: string;
    keyboard: {
        language: string;
        direction: TextDirection;
        revealAnswer: boolean;
        audioButton: () => HTMLElement;
        focus: (root: HTMLElement) => void;
    };
    handwriting: { render: () => HTMLElement; install: (root: HTMLElement) => void };
    text: TypeWordText;
}): void {
    if (!options.root) return;
    const mode = resolveTypeWordAnswerMode(options.configuredMode, options.supportsHandwriting);
    const state = Object.assign({ answer: '' }, options.state);
    const surface = TYPE_WORD_MODE_SURFACES[mode];
    const content = surface.render(options, state);
    delete options.root.dataset.newtabAnswerDetailsRequest;
    Object.assign(options.root.dataset, { typeWordMode: mode, typeWordOutcome: state.feedback || 'pending' });
    options.root.replaceChildren(content, renderTypeWordSecondaryControls(mode, options.supportsHandwriting, options.text));
    const feedback = renderTypeWordFeedback(state.feedback, options.targetText, options.text);
    if (feedback) content.after(feedback);
    surface.activate(options, options.root);
}

type TypeWordAnswerMountOptions = Parameters<typeof mountTypeWordAnswer>[0];
type TypeWordAnswerState = TypeWordSelfCheckState & { answer: string };
interface TypeWordModeSurface {
    render: (options: TypeWordAnswerMountOptions, state: TypeWordAnswerState) => HTMLElement;
    activate: (options: TypeWordAnswerMountOptions, root: HTMLElement) => void;
}

const TYPE_WORD_MODE_SURFACES: Record<NewTabTypeWordInputMode, TypeWordModeSurface> = {
    keyboard: {
        render: (options, state) => renderTypeWordKeyboard({
            ...options.keyboard,
            answer: state.answer,
            feedback: state.feedback,
            audioButton: options.keyboard.audioButton(),
            text: options.text,
        }),
        activate: (options, root) => { if (!options.keyboard.revealAnswer) options.keyboard.focus(root); },
    },
    handwriting: {
        render: options => options.handwriting.render(),
        activate: (options, root) => options.handwriting.install(root),
    },
};

function typeWordOutcomeLabel(
    outcome: NewTabRecallOutcome | 'skipped',
    target: string,
    text: TypeWordText,
): string {
    const label = text(TYPE_WORD_OUTCOME_COPY[outcome]);
    return TYPE_WORD_TARGET_OUTCOMES.has(outcome) ? `${label} · ${isolate(target)}` : label;
}

const TYPE_WORD_OUTCOME_COPY: Record<NewTabRecallOutcome | 'skipped', UiCopyKey | NewTabCopyKey> = {
    correct: 'recallCorrect',
    accepted: 'recallAccepted',
    incorrect: 'typeWordTryAgain',
    empty: 'recallEmpty',
    skipped: 'typeWordSkipped',
};
const TYPE_WORD_TARGET_OUTCOMES = new Set<NewTabRecallOutcome | 'skipped'>(['correct', 'accepted']);

function renderTypeWordSecondaryControls(
    mode: NewTabTypeWordInputMode,
    supportsHandwriting: boolean,
    text: TypeWordText,
): HTMLElement {
    return el('div', { class: 'jpdb-reader-newtab-type-secondary' },
        renderTypeWordModeToggle({ mode, supportsHandwriting, text }),
        el('button', {
            class: 'jpdb-reader-newtab-type-skip',
            type: 'button',
            dataset: { newtabAction: newTabAction('type-word-skip') },
        }, text('typeWordSkip')));
}

function renderTypeWordFeedback(
    feedback: NewTabRecallOutcome | undefined,
    target: string,
    text: TypeWordText,
): HTMLElement | null {
    if (!feedback) return null;
    return el('div', {
        class: 'jpdb-reader-newtab-recall-result jpdb-reader-newtab-type-result',
        dataset: { newtabTypeResult: feedback },
        role: 'status',
        'aria-live': 'polite',
    }, typeWordOutcomeLabel(feedback, target, text));
}

export function targetSupportsTypeWordHandwriting(target: LearningTargetModule, text: string): boolean {
    return target.experiences.handwriting === 'self-check'
        ? targetCanHandwriteText(text, target)
        : Array.from(text).some(targetCanHandwriteCharacter);
}

function renderTypeWordModeToggle(options: {
    mode: NewTabTypeWordInputMode;
    supportsHandwriting: boolean;
    text: TypeWordText;
}): HTMLElement {
    const button = (value: NewTabTypeWordInputMode, label: string) => el('button', {
        class: 'jpdb-reader-newtab-type-mode',
        type: 'button',
        dataset: { newtabAction: newTabAction('type-word-mode'), typeWordMode: value, active: String(options.mode === value) },
        'aria-pressed': String(options.mode === value),
        disabled: value === 'handwriting' && !options.supportsHandwriting,
        title: value === 'handwriting' && !options.supportsHandwriting ? options.text('typeWordHandwritingUnavailable') : undefined,
    }, label);
    return el('div', { class: 'jpdb-reader-newtab-type-modes', role: 'group', 'aria-label': options.text('typeWordModeGroup') },
        button('keyboard', options.text('typeWordModeKeyboard')),
        button('handwriting', options.text('typeWordModeHandwriting')),
    );
}

function renderTypeWordKeyboard(options: {
    answer: string;
    feedback?: NewTabRecallOutcome;
    language: string;
    direction: TextDirection;
    revealAnswer: boolean;
    audioButton: HTMLElement;
    text: TypeWordText;
}): HTMLElement {
    const readyToContinue = options.feedback === 'correct' || options.feedback === 'accepted';
    return el('form', { class: 'jpdb-reader-newtab-recall-form jpdb-reader-newtab-type-form', dataset: { newtabTypeForm: true } },
        options.audioButton,
        el('input', {
            class: 'jpdb-reader-newtab-recall-input jpdb-reader-newtab-type-input',
            dataset: { newtabTypeInput: true },
            value: options.answer,
            placeholder: options.text('typeWordPlaceholder'),
            autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: false,
            inputmode: 'text', enterkeyhint: 'done', lang: options.language, dir: options.direction,
            'aria-label': options.text('typeWordPlaceholder'),
            disabled: options.revealAnswer,
            readOnly: readyToContinue,
        }),
        el('button', {
            class: 'jpdb-reader-newtab-recall-check',
            type: 'button',
            dataset: { newtabAction: newTabAction('type-word-submit') },
            'aria-label': options.text(readyToContinue ? 'continueStudying' : 'recallCheck'),
        }, `${options.text(readyToContinue ? 'continueStudying' : 'recallCheck')} →`),
    );
}

export function renderStrokeFeedbackHandwriting(options: {
    chars: string[];
    progress: number;
    doodleFront: HTMLElement;
    isFixed: (character: string) => boolean;
    text: TypeWordText;
}): HTMLElement {
    return el('div', { class: 'jpdb-reader-newtab-type-handwriting', dataset: { typeWordChars: String(options.chars.length), typeWordProgress: String(options.progress) } },
        el('div', { class: 'jpdb-reader-newtab-type-handwriting-track', 'aria-label': options.text('typeWordProgress') },
            options.chars.map((character, index) => {
                const fixed = options.isFixed(character);
                let content = '＿';
                let done = false;
                let active = false;
                if (fixed) content = character;
                else if (index < options.progress) {
                    content = character;
                    done = true;
                }
                else if (index === options.progress) active = true;
                return el('span', {
                    class: 'jpdb-reader-newtab-type-handwriting-cell', lang: 'ja',
                    dataset: { fixed: String(fixed), done: String(done), active: String(active) },
                }, content);
            })),
        options.progress >= options.chars.length
            ? el('div', { class: 'jpdb-reader-newtab-recall-result jpdb-reader-newtab-type-result', dataset: { newtabTypeResult: 'correct' } }, options.text('typeWordAllDone'))
            : el('div', { class: 'jpdb-reader-newtab-type-handwriting-prompt', lang: 'ja' }, options.text('typeWordWriteChar')),
        options.doodleFront,
    );
}

export function renderSelfCheckHandwriting(options: {
    targetText: string;
    language: string;
    direction: TextDirection;
    state?: TypeWordSelfCheckState;
    text: TypeWordText;
}): HTMLElement {
    const revealed = Boolean(options.state?.selfCheckRevealed);
    const passed = options.state?.feedback === 'correct';
    return el('div', {
        class: 'jpdb-reader-newtab-type-handwriting jpdb-reader-newtab-type-handwriting-self-check',
        dataset: { typeWordSelfCheck: true },
    },
        el('p', { class: 'jpdb-reader-newtab-type-handwriting-prompt' }, options.text('typeWordWriteWord')),
        selfCheckDoodleFront(options.text),
        el('div', {
            class: 'jpdb-reader-newtab-type-self-check-answer jpdb-reader-parseable',
            dataset: { typeWordSelfCheckAnswer: true },
            lang: options.language, dir: options.direction, hidden: !revealed,
        }, options.targetText),
        passed
            ? selfCheckButton('jpdb-reader-newtab-recall-check', newTabAction('type-word-handwriting-match'), `${options.text('continueStudying')} →`)
            : el('div', { class: 'jpdb-reader-newtab-type-self-check-actions' },
                selfCheckButton('jpdb-reader-newtab-recall-check', newTabAction('type-word-handwriting-check'), options.text('typeWordCompare'), { hidden: revealed, disabled: true }),
                el('div', { dataset: { typeWordSelfCheckChoices: true }, hidden: !revealed },
                    el('p', {}, options.text('typeWordSelfCheckPrompt')),
                    selfCheckButton('jpdb-reader-newtab-type-self-check-choice', newTabAction('type-word-handwriting-match'), options.text('typeWordMatched')),
                    selfCheckButton('jpdb-reader-newtab-type-self-check-choice', newTabAction('type-word-handwriting-retry'), options.text('typeWordTryAgain')),
                ),
            ),
    );
}

export function installSelfCheckDoodle(answer: HTMLElement, interfaceLanguage: () => InterfaceLanguage): void {
    const check = answer.querySelector<HTMLButtonElement>(newTabActionSelector('type-word-handwriting-check'));
    installKanjiDoodle(answer, interfaceLanguage, {
        onChange: strokes => { if (check) check.disabled = strokes.length === 0; },
        onClear: () => { if (check) check.disabled = true; },
    });
}

function selfCheckDoodleFront(text: TypeWordText): HTMLElement {
    return el('div', { class: 'jpdb-reader-newtab-kanji-front' },
        el('div', { class: 'jpdb-reader-doodle-stage jpdb-reader-newtab-doodle trace-hidden' },
            el('canvas', { class: 'jpdb-reader-doodle-canvas', 'aria-label': text('drawKanji') }),
        ),
        el('div', { class: 'jpdb-reader-doodle-tools jpdb-reader-newtab-doodle-actions' },
            el('button', { class: 'jpdb-reader-btn jpdb-reader-doodle-control', type: 'button', dataset: { doodleClear: true } }, text('clear')),
        ),
    );
}

function selfCheckButton(
    className: string,
    action: 'type-word-handwriting-check' | 'type-word-handwriting-match' | 'type-word-handwriting-retry',
    label: string,
    attrs: { hidden?: boolean; disabled?: boolean } = {},
): HTMLButtonElement {
    return el('button', {
        class: className, type: 'button', dataset: { newtabAction: action }, ...attrs,
    }, label);
}
