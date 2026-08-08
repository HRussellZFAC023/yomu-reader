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
    feedback?: NewTabRecallOutcome;
    selfCheckRevealed?: boolean;
}

export type TypeWordSelfCheckAction = 'reveal' | 'match' | 'retry';

export function applyTypeWordSelfCheckAction(
    state: TypeWordSelfCheckState | undefined,
    action: TypeWordSelfCheckAction,
): { state?: TypeWordSelfCheckState; outcome?: 'correct' | 'incorrect'; navigate?: boolean } {
    if (action === 'reveal') return { state: { ...state, selfCheckRevealed: true } };
    if (action === 'match' && state?.feedback === 'correct') return { navigate: true };
    if (!state?.selfCheckRevealed) return {};
    return action === 'match'
        ? { state: { ...state, feedback: 'correct', selfCheckRevealed: true }, outcome: 'correct' }
        : { state: { ...state, feedback: 'incorrect', selfCheckRevealed: false }, outcome: 'incorrect' };
}

export function nextTypeWordHandwritingIndex(chars: string[], start: number): number {
    const relative = chars.slice(start).findIndex(targetCanHandwriteCharacter);
    return relative < 0 ? chars.length : start + relative;
}

export function typeWordOutcomeLabel(
    outcome: NewTabRecallOutcome | 'skipped',
    target: string,
    text: TypeWordText,
): string {
    if (outcome === 'correct') return `${text('recallCorrect')} · ${isolate(target)}`;
    if (outcome === 'accepted') return `${text('recallAccepted')} · ${isolate(target)}`;
    if (outcome === 'incorrect') return text('typeWordTryAgain');
    if (outcome === 'empty') return text('recallEmpty');
    return text('typeWordSkipped');
}

export function targetSupportsTypeWordHandwriting(target: LearningTargetModule, text: string): boolean {
    return target.experiences.handwriting === 'self-check'
        ? targetCanHandwriteText(text, target)
        : Array.from(text).some(targetCanHandwriteCharacter);
}

export function renderTypeWordModeToggle(options: {
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

export function renderTypeWordKeyboard(options: {
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
                const done = !fixed && index < options.progress;
                return el('span', {
                    class: 'jpdb-reader-newtab-type-handwriting-cell', lang: 'ja',
                    dataset: { fixed: String(fixed), done: String(done), active: String(!fixed && index === options.progress) },
                }, fixed || done ? character : '＿');
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
            ? selfCheckButton('jpdb-reader-newtab-recall-check', 'type-word-handwriting-match', `${options.text('continueStudying')} →`)
            : el('div', { class: 'jpdb-reader-newtab-type-self-check-actions' },
                selfCheckButton('jpdb-reader-newtab-recall-check', 'type-word-handwriting-check', options.text('typeWordCompare'), { hidden: revealed, disabled: true }),
                el('div', { dataset: { typeWordSelfCheckChoices: true }, hidden: !revealed },
                    el('p', {}, options.text('typeWordSelfCheckPrompt')),
                    selfCheckButton('jpdb-reader-newtab-type-self-check-choice', 'type-word-handwriting-match', options.text('typeWordMatched')),
                    selfCheckButton('jpdb-reader-newtab-type-self-check-choice', 'type-word-handwriting-retry', options.text('typeWordTryAgain')),
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
        class: className, type: 'button', dataset: { newtabAction: newTabAction(action) }, ...attrs,
    }, label);
}
