import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import type { LessonZeroHiraganaDefinition, LessonZeroHiraganaItem } from '../content/lesson-zero-hiragana';
import {
    getLessonZeroHiraganaVisualAnchor,
    type LessonZeroHiraganaVisualAnchor,
} from '../content/lesson-zero-hiragana-visuals';
import {
    lessonZeroHiraganaChoices,
    lessonZeroHiraganaCurrentItem,
    restartLessonZeroHiraganaSession,
    transitionLessonZeroHiraganaSession,
    type LessonZeroHiraganaSessionAction,
    type LessonZeroHiraganaSessionState,
    type LessonZeroHiraganaSessionTransition,
} from '../domain/lesson-zero-hiragana-session';
import type { Disposable, PronunciationService } from '../integration/yomu-bridge';
import { academyBackgroundPicture, backButton, element } from './dom';
import { mountAcademySceneParallax } from './scene-parallax';

type Copy = Readonly<{ en: string; ja: string }>;

export interface LessonZeroHiraganaScreenOptions {
    readonly language: AcademyLanguage;
    readonly definition: LessonZeroHiraganaDefinition;
    readonly initialState: LessonZeroHiraganaSessionState;
    readonly pronunciation: PronunciationService;
    readonly rieSprite?: string;
    readonly onTransition: (
        before: LessonZeroHiraganaSessionState,
        transition: LessonZeroHiraganaSessionTransition,
    ) => void | Promise<void>;
    readonly onRestart: (state: LessonZeroHiraganaSessionState) => void | Promise<void>;
    readonly onBack: () => void | Promise<void>;
    readonly onComplete: () => void | Promise<void>;
}

export interface LessonZeroHiraganaScreen {
    readonly element: HTMLElement;
    dispose(): void;
}

const COPY = {
    eyebrow: { en: 'Kana practice', ja: 'かな練習' },
    title: { en: 'Hiragana', ja: 'ひらがな' },
    intro: { en: 'The full hiragana chart', ja: 'ひらがなの表' },
    introNote: {
        en: 'Ten rows. Then one mixed check.',
        ja: '十の行を練習して、最後にまぜて確認します。',
    },
    begin: { en: 'Start あ-row', ja: 'あ行から始める' },
    placement: { en: 'I know hiragana — test me', ja: 'ひらがなを知っている — テストする' },
    rowProgress: { en: 'Rows', ja: '行' },
    hear: { en: 'Hear', ja: '聞く' },
    drill: { en: 'Drill this row', ja: 'この行を練習する' },
    rowClear: { en: 'Row clear', ja: '行クリア' },
    nextRow: { en: 'Next row', ja: '次の行' },
    finalReady: { en: 'Now mix all 46', ja: '次は46字をまぜる' },
    finalNote: {
        en: 'Type each sound. Misses return.',
        ja: '音を入力します。まちがえた字は、もう一度出ます。',
    },
    startRecall: { en: 'Turn over the chart', ja: '表を裏返す' },
    prompt: { en: 'What sound?', ja: '何の音？' },
    typeSound: { en: 'Type the sound', ja: '音を入力' },
    check: { en: 'Check', ja: '答える' },
    complete: { en: 'All 46 saved', ja: '46字を保存しました' },
    completeBody: {
        en: 'Writing practice comes next.',
        ja: '次は書く練習です。',
    },
    continue: { en: 'Write the first five', ja: '最初の五字を書く' },
    again: { en: 'Practise again', ja: 'もう一度練習する' },
    saved: { en: 'Saved', ja: '保存しました' },
    saveError: { en: 'That answer did not save. Try again.', ja: '保存できませんでした。もう一度。' },
    audioError: { en: 'Audio did not play.', ja: '音声を再生できませんでした。' },
} as const satisfies Readonly<Record<string, Copy>>;

export function createLessonZeroHiraganaScreen(
    options: LessonZeroHiraganaScreenOptions,
): LessonZeroHiraganaScreen {
    const lifecycle = new AbortController();
    let renderLifecycle = new AbortController();
    let state = options.initialState;
    let playback: Disposable | null = null;
    let busy = false;
    let disposed = false;
    let feedback = '';

    const screen = element('section', 'academy-screen academy-hiragana-screen');
    screen.dataset.academyScreen = 'lesson-zero-hiragana-bootcamp';
    screen.dataset.activityId = options.definition.activityId;
    screen.dataset.jpdbReaderInteractionIgnore = '';
    screen.append(academyBackgroundPicture('library'));

    const shell = element('div', 'academy-hiragana-shell');
    const header = element('header', 'academy-hiragana-header');
    const back = backButton(options.language);
    back.classList.add('academy-hiragana-back');
    back.textContent = '←';
    back.title = back.getAttribute('aria-label') ?? '';
    back.addEventListener('click', () => void pauseAndLeave(), { signal: lifecycle.signal });
    const heading = element('div', 'academy-hiragana-heading');
    heading.append(
        localized('p', 'academy-hiragana-eyebrow', COPY.eyebrow, options.language),
        localized('h1', 'academy-hiragana-title', COPY.title, options.language),
    );
    const progress = element('p', 'academy-hiragana-progress');
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    header.append(back, heading, progress);
    const body = element('div', 'academy-hiragana-body');
    const live = element('p', 'academy-hiragana-live');
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    shell.append(header, body, live);
    screen.append(shell);
    mountAcademySceneParallax(screen, lifecycle.signal);

    const render = (): void => {
        renderLifecycle.abort();
        renderLifecycle = new AbortController();
        body.replaceChildren();
        screen.dataset.sessionStatus = state.status;
        screen.dataset.sessionStage = state.stage;
        screen.dataset.sessionRoute = state.route;
        screen.dataset.rowIndex = String(state.rowIndex);
        screen.dataset.attemptCount = String(state.attempts.length);
        screen.dataset.masteryProgress = `${state.masteryPassedItemIds.length}/${options.definition.items.length}`;
        progress.textContent = progressText();
        live.textContent = feedback;
        if (state.status === 'ready') renderIntro(renderLifecycle.signal);
        else if (state.status === 'complete') renderComplete(renderLifecycle.signal);
        else if (state.stage === 'row-preview') renderRowPreview(renderLifecycle.signal);
        else if (state.stage === 'row-drill') renderRowDrill(renderLifecycle.signal);
        else if (state.stage === 'row-result') renderRowResult(renderLifecycle.signal);
        else if (state.stage === 'mastery-ready') renderMasteryReady(renderLifecycle.signal);
        else if (state.stage === 'mastery') renderMastery(renderLifecycle.signal);
    };

    const renderIntro = (signal: AbortSignal): void => {
        const paper = livingPaper();
        paper.append(
            speaker('rie', options.language),
            localized('h2', 'academy-hiragana-paper-title', COPY.intro, options.language),
            localized('p', 'academy-hiragana-copy', COPY.introNote, options.language),
            fullChart(),
            action(COPY.begin, 'primary', signal, () => apply({ kind: 'start-guided' }), options.language),
            action(COPY.placement, 'quiet', signal, () => apply({ kind: 'start-placement' }), options.language),
        );
        body.append(scene(paper, options.rieSprite));
    };

    const renderRowPreview = (signal: AbortSignal): void => {
        const row = options.definition.rows[state.rowIndex]!;
        const paper = livingPaper();
        paper.append(
            speaker('rie', options.language),
            localized('p', 'academy-hiragana-small-title', row.label, options.language),
            kanaRow(row.itemIds, signal),
            localized('p', 'academy-hiragana-copy academy-hiragana-row-cue', row.cue, options.language),
            action(COPY.drill, 'primary', signal, () => apply({ kind: 'begin-row' }), options.language),
        );
        body.append(scene(paper, options.rieSprite));
    };

    const renderRowDrill = (signal: AbortSignal): void => {
        const item = currentItem();
        const visual = getLessonZeroHiraganaVisualAnchor(item.id);
        const paper = livingPaper();
        const prompt = element('section', 'academy-hiragana-prompt');
        prompt.append(
            japanese('p', 'academy-hiragana-kana', item.kana),
            anchorImage(visual, 'academy-hiragana-prompt-image'),
            anchorSupport(visual, 'academy-hiragana-prompt-anchor', 'academy-hiragana-prompt-word'),
            listenButton(item, signal),
        );
        const choices = element('div', 'academy-hiragana-choices');
        choices.setAttribute('role', 'group');
        choices.setAttribute('aria-label', COPY.prompt[options.language]);
        lessonZeroHiraganaChoices(options.definition, item.id).forEach((choice, index) => {
            const button = element('button', 'academy-hiragana-choice');
            button.type = 'button';
            button.textContent = choice;
            button.dataset.choice = `option-${index}`;
            button.addEventListener('click', () => void apply({ kind: 'answer', response: choice }), { signal });
            choices.append(button);
        });
        paper.append(
            speaker('rie', options.language),
            localized('p', 'academy-hiragana-small-title', COPY.prompt, options.language),
            prompt,
            choices,
        );
        body.append(scene(paper, options.rieSprite));
    };

    const renderRowResult = (signal: AbortSignal): void => {
        const row = options.definition.rows[state.rowIndex]!;
        const paper = livingPaper();
        paper.append(
            speaker('rie', options.language),
            localized('h2', 'academy-hiragana-paper-title', COPY.rowClear, options.language),
            kanaRow(row.itemIds, signal),
            action(
                state.rowIndex === options.definition.rows.length - 1 ? COPY.finalReady : COPY.nextRow,
                'primary',
                signal,
                () => apply({ kind: 'next-row' }),
                options.language,
            ),
        );
        body.append(scene(paper, options.rieSprite));
    };

    const renderMasteryReady = (signal: AbortSignal): void => {
        const paper = livingPaper();
        paper.append(
            speaker('rie', options.language),
            localized('h2', 'academy-hiragana-paper-title', COPY.finalReady, options.language),
            localized('p', 'academy-hiragana-copy', COPY.finalNote, options.language),
            masteryColumns(),
            action(COPY.startRecall, 'primary', signal, () => apply({ kind: 'begin-mastery' }), options.language),
        );
        body.append(scene(paper, options.rieSprite));
    };

    const renderMastery = (signal: AbortSignal): void => {
        const item = currentItem();
        const paper = livingPaper();
        const form = element('form', 'academy-hiragana-recall-form');
        const label = localized('label', 'academy-hiragana-field-label', COPY.typeSound, options.language);
        const input = element('input', 'academy-hiragana-input');
        input.type = 'text';
        input.name = 'romaji';
        input.autocomplete = 'off';
        input.autocapitalize = 'none';
        input.spellcheck = false;
        input.inputMode = 'text';
        label.htmlFor = `hiragana-answer-${state.attempts.length}`;
        input.id = label.htmlFor;
        const submit = action(COPY.check, 'primary', signal, () => undefined, options.language);
        submit.type = 'submit';
        form.append(label, input, submit);
        form.addEventListener('submit', event => {
            event.preventDefault();
            void apply({ kind: 'answer', response: input.value });
        }, { signal });
        paper.append(
            speaker('rie', options.language),
            localized('p', 'academy-hiragana-small-title', COPY.prompt, options.language),
            japanese('p', 'academy-hiragana-kana academy-hiragana-kana-mastery', item.kana),
            listenButton(item, signal),
            form,
        );
        body.append(scene(paper, options.rieSprite));
        queueMicrotask(() => input.focus());
    };

    const renderComplete = (signal: AbortSignal): void => {
        const paper = livingPaper();
        const stamp = element('strong', 'academy-hiragana-stamp');
        stamp.textContent = '46 / 46';
        paper.append(
            speaker('rie', options.language),
            localized('h2', 'academy-hiragana-paper-title', COPY.complete, options.language),
            stamp,
            localized('p', 'academy-hiragana-copy', COPY.completeBody, options.language),
            action(COPY.continue, 'primary', signal, () => options.onComplete(), options.language),
            action(COPY.again, 'quiet', signal, () => restart(), options.language),
        );
        body.append(scene(paper, options.rieSprite));
    };

    const fullChart = (): HTMLElement => {
        const chart = element('div', 'academy-hiragana-chart');
        chart.setAttribute('aria-label', '46 basic hiragana');
        options.definition.rows.forEach(row => {
            const line = element('div', 'academy-hiragana-chart-row');
            line.dataset.rowId = row.id;
            row.itemIds.forEach(id => {
                const item = options.definition.items.find(candidate => candidate.id === id)!;
                const mark = japanese('span', 'academy-hiragana-chart-kana', item.kana);
                const sound = element('small', 'academy-hiragana-chart-romaji');
                sound.textContent = item.romaji;
                const cell = element('span', 'academy-hiragana-chart-cell');
                cell.append(mark, sound);
                line.append(cell);
            });
            chart.append(line);
        });
        return chart;
    };

    const kanaRow = (itemIds: readonly string[], signal: AbortSignal): HTMLElement => {
        const rail = element('div', 'academy-hiragana-row');
        itemIds.forEach(id => {
            const item = options.definition.items.find(candidate => candidate.id === id)!;
            const visual = getLessonZeroHiraganaVisualAnchor(id);
            const cell = element('button', 'academy-hiragana-row-item');
            cell.type = 'button';
            cell.append(
                anchorImage(visual, 'academy-hiragana-row-image'),
                japanese('span', 'academy-hiragana-row-kana', item.kana),
                text('small', 'academy-hiragana-row-romaji', item.romaji),
                anchorSupport(visual, 'academy-hiragana-row-anchor', 'academy-hiragana-row-word'),
            );
            cell.setAttribute(
                'aria-label',
                `${COPY.hear[options.language]} ${item.kana}, ${item.romaji}. ${visual.wordJa}, ${visual.reading}, ${visual.pronunciation}, ${visual.meaningEn}`,
            );
            cell.addEventListener('click', () => void play(item), { signal });
            rail.append(cell);
        });
        return rail;
    };

    const masteryColumns = (): HTMLElement => {
        const map = element('div', 'academy-hiragana-mastery-map');
        const columns = ['あ か さ た な は ま や ら わ', 'い き し ち に ひ み り', 'う く す つ ぬ ふ む ゆ る', 'え け せ て ね へ め れ', 'お こ そ と の ほ も よ ろ を', 'ん'];
        columns.forEach(value => map.append(japanese('span', 'academy-hiragana-mastery-column', value)));
        return map;
    };

    const listenButton = (item: LessonZeroHiraganaItem, signal: AbortSignal): HTMLButtonElement => {
        const button = element('button', 'academy-hiragana-listen');
        button.type = 'button';
        button.textContent = '▶';
        button.setAttribute('aria-label', `${COPY.hear[options.language]} ${item.kana}`);
        button.title = `${COPY.hear[options.language]} ${item.kana}`;
        button.addEventListener('click', () => void play(item), { signal });
        return button;
    };

    const apply = async (action: LessonZeroHiraganaSessionAction): Promise<void> => {
        if (busy || disposed) return;
        busy = true;
        const before = state;
        try {
            const transition = transitionLessonZeroHiraganaSession(
                options.definition,
                state,
                action,
                Date.now(),
            );
            await options.onTransition(before, transition);
            state = transition.state;
            const evaluation = transition.evaluation;
            feedback = evaluation
                ? evaluation.result.feedback.explanation[options.language]
                : COPY.saved[options.language];
            render();
        } catch {
            feedback = COPY.saveError[options.language];
            live.textContent = feedback;
        } finally {
            busy = false;
        }
    };

    const restart = async (): Promise<void> => {
        if (busy || disposed) return;
        busy = true;
        try {
            const fresh = restartLessonZeroHiraganaSession(options.definition);
            await options.onRestart(fresh);
            state = fresh;
            feedback = '';
            render();
        } catch {
            feedback = COPY.saveError[options.language];
            live.textContent = feedback;
        } finally {
            busy = false;
        }
    };

    const play = async (item: LessonZeroHiraganaItem): Promise<void> => {
        playback?.dispose();
        playback = null;
        try {
            playback = await options.pronunciation.play(item.kana, item.kana, lifecycle.signal);
        } catch {
            feedback = COPY.audioError[options.language];
            live.textContent = feedback;
        }
    };

    const pauseAndLeave = async (): Promise<void> => {
        if (state.status === 'active') {
            const before = state;
            const transition = transitionLessonZeroHiraganaSession(
                options.definition,
                state,
                { kind: 'pause' },
                Date.now(),
            );
            await options.onTransition(before, transition);
            state = transition.state;
        }
        await options.onBack();
    };

    const progressText = (): string => {
        if (state.status === 'complete') return '46 / 46';
        if (state.stage === 'mastery' || state.stage === 'mastery-ready') {
            return `${state.masteryPassedItemIds.length} / 46`;
        }
        const clearedRows = options.definition.rows.filter(row =>
            row.itemIds.every(id => state.guidedPassedItemIds.includes(id))).length;
        return `${COPY.rowProgress[options.language]} ${clearedRows} / ${options.definition.rows.length}`;
    };

    const currentItem = (): LessonZeroHiraganaItem => {
        const item = lessonZeroHiraganaCurrentItem(options.definition, state);
        if (!item) throw new TypeError('Hiragana screen has no current item.');
        return item;
    };

    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        renderLifecycle.abort();
        lifecycle.abort();
        playback?.dispose();
        playback = null;
    };

    render();
    return { element: screen, dispose };
}

function scene(paper: HTMLElement, rieSprite?: string): HTMLElement {
    const root = element('div', 'academy-hiragana-scene');
    const portrait = element('img', 'academy-hiragana-portrait');
    portrait.src = rieSprite ?? ACADEMY_ASSETS.characters.approvedPerformances.rie.encouraging;
    portrait.alt = '';
    portrait.setAttribute('aria-hidden', 'true');
    root.append(portrait, paper);
    return root;
}

function livingPaper(): HTMLElement {
    const paper = element('article', 'academy-hiragana-paper');
    paper.append(element('span', 'academy-hiragana-paperclip'));
    return paper;
}

function speaker(speakerId: 'rie', language: AcademyLanguage): HTMLElement {
    const name = element('strong', 'academy-hiragana-speaker');
    name.dataset.speakerId = speakerId;
    name.textContent = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    return name;
}

function action(
    copy: Copy,
    variant: 'primary' | 'quiet',
    signal: AbortSignal,
    callback: () => void | Promise<void>,
    language: AcademyLanguage,
): HTMLButtonElement {
    const button = element('button', `academy-button academy-hiragana-action academy-hiragana-action-${variant}`);
    button.type = 'button';
    button.textContent = copy[language];
    button.setAttribute('aria-label', copy[language]);
    button.addEventListener('click', () => void callback(), { signal });
    return button;
}

function localized<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    copy: Copy,
    language: AcademyLanguage,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.lang = language;
    node.textContent = copy[language];
    if (language === 'ja') {
        node.dataset.yomuRuntimeSurface = 'lesson-zero-hiragana-copy';
        node.dataset.yomuFuriganaMode = 'all';
    } else {
        node.dataset.jpdbReaderSurfaceIgnore = '';
    }
    return node;
}

function japanese<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    value: string,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.lang = 'ja';
    node.textContent = value;
    node.dataset.yomuRuntimeSurface = 'lesson-zero-hiragana-japanese';
    node.dataset.yomuFuriganaMode = 'all';
    return node;
}

function text<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    value: string,
): HTMLElementTagNameMap[K] {
    const node = element(tag, className);
    node.textContent = value;
    node.dataset.jpdbReaderSurfaceIgnore = '';
    return node;
}

function anchorImage(
    anchor: LessonZeroHiraganaVisualAnchor,
    className: string,
): HTMLImageElement {
    const image = element('img', className);
    image.src = anchor.imagePath;
    image.alt = anchor.imageAlt;
    image.width = 384;
    image.height = 384;
    image.decoding = 'async';
    image.dataset.hiraganaAnchorImage = anchor.itemId;
    return image;
}

function anchorWord(
    anchor: LessonZeroHiraganaVisualAnchor,
    className: string,
): HTMLElement {
    const word = element('span', className);
    word.lang = 'ja';
    word.dataset.yomuRuntimeSurface = 'lesson-zero-hiragana-anchor';
    word.dataset.yomuFuriganaMode = 'all';
    const targetIndex = anchor.kind === 'object-particle'
        ? anchor.reading.lastIndexOf(anchor.kana)
        : anchor.reading.indexOf(anchor.kana);
    const before = anchor.reading.slice(0, Math.max(0, targetIndex));
    const after = anchor.reading.slice(Math.max(0, targetIndex) + anchor.kana.length);
    if (before) word.append(text('span', 'academy-hiragana-anchor-before', before));
    word.append(japanese('strong', 'academy-hiragana-anchor-target', anchor.kana));
    if (after) word.append(text('span', 'academy-hiragana-anchor-after', after));
    return word;
}

function anchorSupport(
    anchor: LessonZeroHiraganaVisualAnchor,
    className: string,
    wordClassName: string,
): HTMLElement {
    const support = element('span', className);
    if (anchor.wordJa !== anchor.reading) {
        support.append(japanese('strong', `${className}-headword`, anchor.wordJa));
    }
    support.append(
        anchorWord(anchor, wordClassName),
        text('small', `${className}-pronunciation`, anchor.pronunciation),
        text('small', `${className}-meaning`, anchor.meaningEn),
    );
    return support;
}
