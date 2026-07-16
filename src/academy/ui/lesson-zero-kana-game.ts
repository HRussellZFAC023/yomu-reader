import { installKanjiDoodle } from '../../reader/kanji/doodle';
import { convertRomajiToKana } from '../../reader/newtab/japanese-input';
import {
    LESSON_ZERO_KANA_SEQUENCE,
    LESSON_ZERO_SOURCE_MEDIA,
    LESSON_ZERO_SOURCE_PROVENANCE,
} from '../content/lesson-zero-source-material';
import type { PronunciationService } from '../integration/yomu-bridge';

type KanaMode = 'recognition' | 'listening' | 'typing' | 'drawing';
type ReferencePage = 'writing-system' | 'hiragana' | null;

export interface LessonZeroKanaGameOptions {
    readonly language: 'en' | 'ja';
    readonly pronunciation: PronunciationService;
    readonly onReferenceChange: (page: ReferencePage) => void;
    readonly onComplete: () => void;
}

export interface LessonZeroKanaGame {
    readonly element: HTMLElement;
    dispose(): void;
}

const MODES: readonly KanaMode[] = ['recognition', 'listening', 'typing', 'drawing'];

export function createLessonZeroKanaGame(options: LessonZeroKanaGameOptions): LessonZeroKanaGame {
    const root = document.createElement('section');
    root.className = 'academy-lesson-zero-kana-game';
    root.dataset.kanaSourceOrder = LESSON_ZERO_KANA_SEQUENCE.map(item => item.kana).join('');
    root.dataset.provenance = LESSON_ZERO_SOURCE_MEDIA.provenance;
    let sourcePage: ReferencePage = 'writing-system';
    let modeIndex = 0;
    let kanaIndex = 0;
    let cleanupTurn: (() => void) | null = null;
    let disposed = false;

    const advance = (): void => {
        kanaIndex += 1;
        if (kanaIndex >= LESSON_ZERO_KANA_SEQUENCE.length) {
            kanaIndex = 0;
            modeIndex += 1;
        }
        if (modeIndex >= MODES.length) {
            options.onComplete();
            return;
        }
        renderTurn();
    };

    const renderTurn = (): void => {
        cleanupTurn?.();
        cleanupTurn = null;
        root.replaceChildren();
        const mode = MODES[modeIndex];
        const item = LESSON_ZERO_KANA_SEQUENCE[kanaIndex];
        root.dataset.kanaMode = mode;
        root.dataset.kanaIndex = String(kanaIndex);
        root.append(progress(mode, kanaIndex, options.language));
        if (mode === 'recognition') renderRecognition(root, item, options.language, advance);
        else if (mode === 'listening') cleanupTurn = renderListening(
            root,
            item,
            options.language,
            options.pronunciation,
            advance,
        );
        else if (mode === 'typing') renderTyping(root, item, options.language, advance);
        else cleanupTurn = renderDrawing(root, item, options.language, advance);
    };

    const renderSourceStep = (): void => {
        root.replaceChildren();
        root.dataset.kanaMode = 'source';
        const title = document.createElement('p');
        title.className = 'academy-lesson-zero-kana-source-title';
        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'academy-vn-primary-action';
        if (sourcePage === 'writing-system') {
            title.textContent = 'Japanese writing system';
            next.textContent = options.language === 'ja' ? '次へ' : 'Next';
            next.addEventListener('click', () => {
                sourcePage = 'hiragana';
                options.onReferenceChange(sourcePage);
                renderSourceStep();
            }, { once: true });
        } else {
            title.textContent = 'Self Study: Hiragana writing practice あ、い、う、え、お';
            next.textContent = options.language === 'ja' ? 'はじめる' : 'Begin';
            next.addEventListener('click', () => {
                sourcePage = null;
                options.onReferenceChange(null);
                renderTurn();
            }, { once: true });
        }
        root.append(title);
        if (sourcePage === 'hiragana') root.append(kanaTeachingGuide(options.language));
        root.append(next);
    };

    options.onReferenceChange(sourcePage);
    renderSourceStep();
    return {
        element: root,
        dispose() {
            if (disposed) return;
            disposed = true;
            cleanupTurn?.();
            root.remove();
        },
    };
}

function kanaTeachingGuide(language: 'en' | 'ja'): HTMLElement {
    const guide = document.createElement('section');
    guide.className = 'academy-lesson-zero-kana-teaching';
    guide.setAttribute('aria-label', language === 'ja' ? '練習前の読み方' : 'Readings before practice');
    const instruction = document.createElement('p');
    instruction.textContent = language === 'ja'
        ? '先に五文字と読み方を見てから、練習を始めましょう。'
        : 'Study these five characters and readings before practice.';
    const mappings = document.createElement('dl');
    for (const item of LESSON_ZERO_KANA_SEQUENCE) {
        const kana = document.createElement('dt');
        kana.lang = 'ja';
        kana.textContent = item.kana;
        const reading = document.createElement('dd');
        reading.textContent = item.romaji;
        mappings.append(kana, reading);
    }
    guide.append(instruction, mappings);
    return guide;
}

export function createLessonZeroSourcePage(page: Exclude<ReferencePage, null>): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'academy-lesson-zero-source-page';
    figure.tabIndex = 0;
    figure.dataset.sourcePage = page;
    figure.dataset.sourceSha256 = page === 'writing-system'
        ? LESSON_ZERO_SOURCE_PROVENANCE.writingSystemSha256
        : LESSON_ZERO_SOURCE_PROVENANCE.hiraganaARowSha256;
    figure.dataset.sourceLocus = 'page 1';
    const image = document.createElement('img');
    image.src = page === 'writing-system'
        ? LESSON_ZERO_SOURCE_MEDIA.writingSystem
        : LESSON_ZERO_SOURCE_MEDIA.hiraganaARow;
    image.alt = page === 'writing-system'
        ? 'Chapter 1 Japanese writing system introduction, page 1'
        : 'Self Study: Hiragana writing practice あ、い、う、え、お';
    figure.setAttribute('aria-label', image.alt);
    figure.append(image);
    return figure;
}

function progress(mode: KanaMode, index: number, language: 'en' | 'ja'): HTMLElement {
    const element = document.createElement('p');
    element.className = 'academy-lesson-zero-kana-progress';
    element.textContent = `${modeLabel(mode, language)} ${index + 1}/${LESSON_ZERO_KANA_SEQUENCE.length}`;
    return element;
}

function renderRecognition(
    root: HTMLElement,
    item: typeof LESSON_ZERO_KANA_SEQUENCE[number],
    language: 'en' | 'ja',
    advance: () => void,
): void {
    const cue = kanaCue(item.kana, language === 'ja' ? '読み方を選んでください。' : 'Choose the reading.');
    const choices = choiceGrid();
    const status = statusLine();
    for (const candidate of LESSON_ZERO_KANA_SEQUENCE) {
        choices.append(choice(candidate.romaji, () => {
            if (candidate.romaji !== item.romaji) {
                status.textContent = language === 'ja' ? 'もう一度。' : 'Try again.';
                return;
            }
            revealAndContinue(root, status, `${item.kana} = ${item.romaji}`, language, advance);
        }));
    }
    root.append(cue, choices, status);
}

function renderListening(
    root: HTMLElement,
    item: typeof LESSON_ZERO_KANA_SEQUENCE[number],
    language: 'en' | 'ja',
    pronunciation: PronunciationService,
    advance: () => void,
): () => void {
    const prompt = document.createElement('p');
    prompt.className = 'academy-lesson-zero-kana-prompt';
    prompt.textContent = language === 'ja' ? '聞いて、文字を選んでください。' : 'Listen, then choose the character.';
    let playback: { dispose(): void } | null = null;
    let pending = false;
    const play = choice(language === 'ja' ? '音声を再生' : 'Play audio', () => {
        if (pending) return;
        pending = true;
        play.disabled = true;
        playback?.dispose();
        playback = null;
        status.textContent = language === 'ja' ? '音声を読み込んでいます…' : 'Loading pronunciation...';
        void pronunciation.play(item.kana, item.kana).then(active => {
            playback = active;
            status.textContent = language === 'ja' ? '聞こえた文字を選んでください。' : 'Choose the character you heard.';
        }).catch(() => {
            status.textContent = language === 'ja'
                ? '音声を再生できません。もう一度お試しください。'
                : 'Pronunciation is unavailable. Try again.';
        }).finally(() => {
            pending = false;
            play.disabled = false;
        });
    });
    play.classList.add('academy-lesson-zero-kana-play');
    const choices = choiceGrid();
    const status = statusLine();
    for (const candidate of LESSON_ZERO_KANA_SEQUENCE) {
        choices.append(choice(candidate.kana, () => {
            if (candidate.kana !== item.kana) {
                status.textContent = language === 'ja' ? 'もう一度聞いてください。' : 'Listen again.';
                return;
            }
            revealAndContinue(root, status, `${item.kana} = ${item.romaji}`, language, advance);
        }));
    }
    root.append(prompt, play, choices, status);
    return () => playback?.dispose();
}

function renderTyping(
    root: HTMLElement,
    item: typeof LESSON_ZERO_KANA_SEQUENCE[number],
    language: 'en' | 'ja',
    advance: () => void,
): void {
    const form = document.createElement('form');
    form.className = 'academy-lesson-zero-kana-typing';
    const cue = kanaCue(item.romaji, language === 'ja' ? 'ひらがなで入力してください。' : 'Type the hiragana.');
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.inputMode = 'text';
    input.maxLength = 8;
    input.autocapitalize = 'off';
    input.spellcheck = false;
    input.className = 'academy-lesson-zero-kana-input';
    input.setAttribute('aria-label', language === 'ja' ? `${item.romaji}のひらがな` : `Hiragana for ${item.romaji}`);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'academy-vn-primary-action';
    submit.textContent = language === 'ja' ? '確認' : 'Check';
    const status = statusLine();
    const preview = document.createElement('output');
    preview.className = 'academy-lesson-zero-kana-input-preview';
    preview.setAttribute('aria-live', 'polite');
    let composing = false;
    const refreshPreview = (): void => {
        const converted = convertRomajiToKana(input.value.trim());
        preview.value = converted && converted !== input.value.trim()
            ? `${language === 'ja' ? 'かな' : 'Kana'}: ${converted}`
            : '';
    };
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => {
        composing = false;
        refreshPreview();
    });
    input.addEventListener('input', () => { if (!composing) refreshPreview(); });
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (composing) return;
        const answer = convertRomajiToKana(input.value.trim()).normalize('NFKC');
        if (answer !== item.kana) {
            status.textContent = language === 'ja'
                ? `${item.romaji} を入力するか、日本語キーボードで答えてください。`
                : `Try ${item.romaji}, or use a Japanese keyboard.`;
            input.focus();
            return;
        }
        input.disabled = true;
        submit.disabled = true;
        revealAndContinue(root, status, `${item.kana} = ${item.romaji}`, language, advance);
    });
    const help = document.createElement('p');
    help.className = 'academy-lesson-zero-kana-input-help';
    help.textContent = language === 'ja'
        ? 'ローマ字でも、ひらがなでも入力できます。'
        : 'Type romaji or hiragana; both are accepted.';
    form.append(cue, help, input, preview, submit, status);
    root.append(form);
    input.focus();
}

function renderDrawing(
    root: HTMLElement,
    item: typeof LESSON_ZERO_KANA_SEQUENCE[number],
    language: 'en' | 'ja',
    advance: () => void,
): () => void {
    const prompt = kanaCue(
        item.kana,
        'The gray lines are aids to accurate style. In writing hiragana, the stroke order is, as a rule, first from top to bottom, then from left to right. To be sure, follow the arrows.',
    );
    const doodle = document.createElement('div') as HTMLElement & { __yomuKanjiDoodleCleanup?: () => void };
    doodle.className = 'academy-doodle academy-lesson-zero-kana-doodle';
    const stage = document.createElement('div');
    stage.className = 'jpdb-reader-doodle-stage trace-hidden';
    const ghost = document.createElement('div');
    ghost.className = 'jpdb-reader-doodle-ghost';
    ghost.hidden = true;
    const canvas = document.createElement('canvas');
    canvas.className = 'jpdb-reader-doodle-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', language === 'ja' ? `${item.kana}を書く` : `Canvas for writing ${item.kana}`);
    stage.append(ghost, canvas);
    const tools = document.createElement('div');
    tools.className = 'jpdb-reader-doodle-tools';
    const clear = choice(language === 'ja' ? '消す' : 'Clear', () => undefined);
    clear.dataset.doodleClear = '';
    const check = choice(language === 'ja' ? '見本と比べる' : 'Compare with source', () => {
        if (!hasDrawn) {
            status.textContent = language === 'ja' ? '先に一画書いてください。' : 'Draw before checking.';
            return;
        }
        source.hidden = false;
        check.disabled = true;
        revealAndContinue(root, status, `${item.kana} = ${item.romaji}`, language, advance);
    });
    tools.append(clear, check);
    const status = statusLine();
    const source = document.createElement('img');
    source.className = 'academy-lesson-zero-kana-source-reveal';
    source.src = LESSON_ZERO_SOURCE_MEDIA.hiraganaARow;
    source.alt = 'Self Study: Hiragana writing practice あ、い、う、え、お';
    source.hidden = true;
    doodle.append(stage, tools, status, source);
    root.append(prompt, doodle);
    let hasDrawn = false;
    canvas.addEventListener('pointerdown', () => { hasDrawn = true; });
    installKanjiDoodle(doodle, () => language, {
        onChange(strokes) { hasDrawn ||= strokes.some(stroke => stroke.length > 0); },
        onClear() {
            hasDrawn = false;
            status.textContent = '';
            source.hidden = true;
            check.disabled = false;
        },
    });
    canvas.focus();
    return () => doodle.__yomuKanjiDoodleCleanup?.();
}

function kanaCue(value: string, instruction: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'academy-lesson-zero-kana-cue';
    const valueElement = document.createElement('strong');
    valueElement.textContent = value;
    const prompt = document.createElement('span');
    prompt.textContent = instruction;
    wrapper.append(valueElement, prompt);
    return wrapper;
}

function choiceGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'academy-lesson-zero-kana-choices';
    return grid;
}

function choice(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'academy-lesson-zero-kana-choice';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
}

function statusLine(): HTMLElement {
    const status = document.createElement('p');
    status.className = 'academy-lesson-zero-kana-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    return status;
}

function revealAndContinue(
    root: HTMLElement,
    status: HTMLElement,
    answer: string,
    language: 'en' | 'ja',
    advance: () => void,
): void {
    if (root.querySelector('[data-kana-continue]')) return;
    status.textContent = answer;
    const next = choice(language === 'ja' ? '次へ' : 'Next', advance);
    next.classList.add('academy-vn-primary-action');
    next.dataset.kanaContinue = '';
    root.append(next);
    next.focus();
}

function modeLabel(mode: KanaMode, language: 'en' | 'ja'): string {
    const labels = language === 'ja'
        ? { recognition: '見る', listening: '聞く', typing: '入力', drawing: '書く' }
        : { recognition: 'Recognise', listening: 'Listen', typing: 'Type', drawing: 'Draw' };
    return labels[mode];
}
