import type { AcademyLanguage } from '../../reader/app/academy-copy';
import { ACADEMY_ASSETS } from '../assets';
import type { LibraryVocabularySheet, LibraryVocabularySheetItem } from '../content/library-vocabulary-sheet';
import type { AcademyStudyVocabulary } from '../integration/study-module';
import { attachLibraryReaderVocabulary } from '../integration/library-reader-vocabulary';
import { academyBackgroundPicture, backButton, element } from './dom';

const vocabularySheetClosers = new WeakMap<HTMLElement, () => void>();

export interface LibraryScreenOptions {
    readonly language: AcademyLanguage;
    readonly sheet: LibraryVocabularySheet;
    readonly due: readonly AcademyStudyVocabulary[];
    readonly syllabusState?: LibrarySyllabusState;
    readonly onBack: () => void;
    readonly onStart: () => void;
    readonly onPlay: (word: LibraryVocabularySheetItem) => void;
}

export type LibrarySyllabusState = 'due' | 'new' | 'cleared' | 'empty';

export interface VocabularySheetOptions {
    readonly language: AcademyLanguage;
    readonly sheet: LibraryVocabularySheet;
    readonly due: readonly AcademyStudyVocabulary[];
    readonly syllabusState?: LibrarySyllabusState;
    readonly onPlay: (word: LibraryVocabularySheetItem) => void;
    readonly onStart?: () => void;
    readonly startLabel?: string;
}

export function renderLibraryIntroduction(
    language: AcademyLanguage,
    onContinue: () => void,
): HTMLElement {
    const screen = libraryScene('academy-library-introduction');
    screen.dataset.academyRoute = 'review';
    screen.dataset.currentPlace = 'library';
    const dialogue = element('section', 'academy-library-dialogue');
    dialogue.setAttribute('aria-label', language === 'ja' ? '図書館の案内' : 'Library introduction');
    const portrait = element('img', 'academy-library-sensei');
    portrait.src = ACADEMY_ASSETS.rie;
    portrait.alt = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    const card = element('div', 'academy-library-dialogue-paper');
    const speaker = element('p', 'academy-library-speaker');
    speaker.textContent = language === 'ja' ? 'りえ先生' : 'Rie-sensei';
    const heading = element('h1', 'academy-library-dialogue-title');
    heading.textContent = language === 'ja' ? '図書館' : 'The Library';
    const line = element('p', 'academy-library-line');
    line.textContent = language === 'ja'
        ? '静かな席を取っておきました。いまの授業、または開き直した授業の先生の単語帳を、まず資料どおりの順番で読みましょう。次によむの学習へ進むと、その行は実際の復習予定に入ります。カードは「単語」から始まり、例文があると「入力」へ進みます。'
        : 'I saved you a quiet desk. First read the exact Sensei sheet for this lesson, or for the lesson you chose to revisit. Then open Yomu Study: those rows enter its real review schedule. Cards begin with Word, and Type follows when an example sentence is available.';
    const actions = element('div', 'academy-library-dialogue-actions');
    const continueButton = button(language === 'ja' ? '席へ' : 'Take a seat', 'academy-library-dialogue-continue');
    continueButton.addEventListener('click', onContinue);
    actions.append(continueButton);
    card.append(speaker, heading, line, actions);
    dialogue.append(portrait, card);
    screen.append(dialogue);
    requestAnimationFrame(() => continueButton.focus({ preventScroll: true }));
    return screen;
}

export function renderLibraryScreen(options: LibraryScreenOptions): HTMLElement {
    const screen = libraryScene('academy-library-screen');
    screen.dataset.academyRoute = 'review';
    screen.dataset.currentPlace = 'library';
    screen.dataset.dueCount = String(options.due.length);
    screen.dataset.vocabularySheet = options.sheet.id;
    screen.dataset.lessonId = options.sheet.lessonId;
    screen.dataset.sourceStatus = options.sheet.sourceStatus;
    const hasDueWords = options.due.length > 0;
    const hasSourceWords = options.sheet.sourceStatus === 'exact-source' && options.sheet.items.length > 0;
    const syllabusState: LibrarySyllabusState = hasDueWords
        ? 'due'
        : options.syllabusState ?? (hasSourceWords ? 'new' : 'empty');
    screen.dataset.queueState = syllabusState;
    const header = element('header', 'academy-library-place-header');
    const marker = element('p', 'academy-library-marker');
    marker.textContent = options.language === 'ja' ? '夕方' : 'Evening';
    const title = element('h1', 'academy-library-title');
    title.textContent = options.language === 'ja' ? '図書館' : 'The Library';
    const moment = element('p', 'academy-library-moment');
    moment.textContent = options.language === 'ja'
        ? `${options.sheet.lessonId}・雨の夕方・静かな机`
        : `${options.sheet.lessonId} · Rainy evening · a quiet desk`;
    header.append(marker, title, moment);

    const desk = element('aside', 'academy-library-desk');
    desk.setAttribute('aria-label', options.language === 'ja' ? '図書館の机' : 'Library desk');
    const note = element('p', 'academy-library-note');
    note.textContent = options.sheet.sourceStatus === 'not-provided' && hasDueWords
        ? options.language === 'ja'
            ? 'この授業には確認済みの先生の単語行がありませんが、予定された復習カードはそのまま使えます。'
            : 'This lesson has no verified teacher rows, but your scheduled review cards are still available.'
        : options.sheet.sourceStatus === 'not-provided'
            ? options.language === 'ja'
                ? 'この授業には確認済みの先生の単語行がなく、いま復習するカードもありません。'
                : 'This lesson has no verified teacher rows, and nothing is due right now.'
        : hasDueWords
        ? options.language === 'ja'
            ? '次のカードは、よむの実際の予定から来ています。先生の単語帳は資料のまま、いつでも見直せます。'
            : 'The next card comes from Yomu’s real schedule. The Sensei sheet remains an unchanged reference.'
        : syllabusState === 'cleared'
        ? options.language === 'ja'
            ? 'いま復習するカードはありません。先生の単語は、よむの予定どおり次の復習までそのままです。'
            : 'Nothing is due. These Sensei words remain in Yomu and will return on their real next review date.'
        : options.language === 'ja'
            ? '復習期限のカードはありません。先生の単語帳を見て、その行をよむの学習に渡せます。'
            : 'Nothing is due. You can still read the Sensei sheet and hand its rows to Yomu Study.';
    const sheet = button(
        hasSourceWords
            ? options.language === 'ja' ? '先生の単語帳を開く' : 'Open teacher vocabulary sheet'
            : options.language === 'ja' ? '単語の状態を確認' : 'View vocabulary status',
        'academy-library-sheet-button',
    );
    sheet.addEventListener('click', () => openVocabularySheet(screen, {
        language: options.language,
        sheet: options.sheet,
        due: options.due,
        syllabusState,
        onPlay: options.onPlay,
        onStart: options.onStart,
    }, sheet));
    const back = backButton(options.language);
    back.classList.add('academy-library-back');
    back.addEventListener('click', options.onBack);
    desk.append(note, sheet, back);
    screen.append(header, desk);
    return screen;
}

export function openVocabularySheet(
    host: HTMLElement,
    options: VocabularySheetOptions,
    trigger?: HTMLElement,
): { close(): void } {
    const existing = host.querySelector<HTMLElement>('.academy-vocabulary-sheet-layer');
    if (existing) return { close: vocabularySheetClosers.get(existing) ?? (() => existing.remove()) };
    const layer = element('div', 'academy-vocabulary-sheet-layer');
    layer.setAttribute('role', 'presentation');
    const sheet = element('section', 'academy-vocabulary-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'academy-vocabulary-sheet-heading');
    sheet.setAttribute('aria-describedby', 'academy-vocabulary-sheet-summary');
    sheet.tabIndex = -1;
    const header = element('header', 'academy-vocabulary-sheet-header');
    const sourceLabel = element('p', 'academy-vocabulary-sheet-source-label');
    sourceLabel.textContent = options.sheet.sourceStatus === 'exact-source'
        ? options.language === 'ja' ? '確認済みの先生の資料' : 'Verified teacher source'
        : options.language === 'ja' ? '先生の資料は未確認' : 'Teacher source unavailable';
    const heading = element('h2', 'academy-vocabulary-sheet-title');
    heading.id = 'academy-vocabulary-sheet-heading';
    heading.textContent = options.sheet.title;
    const summary = element('p', 'academy-vocabulary-sheet-summary');
    summary.id = 'academy-vocabulary-sheet-summary';
    summary.textContent = options.sheet.sourceStatus === 'exact-source'
        ? options.language === 'ja'
            ? `先生の順番で ${options.sheet.items.length} 行・いま復習する ${options.due.length} 語`
            : `${options.sheet.items.length} rows in teacher order · ${options.due.length} due now`
        : options.language === 'ja'
            ? `確認済みの先生の単語行なし・いま復習する ${options.due.length} 語`
            : `No verified teacher rows · ${options.due.length} due now`;
    header.append(sourceLabel, heading, summary);
    const closeButton = button(options.language === 'ja' ? '閉じる' : 'Close', 'academy-vocabulary-sheet-close');
    const restoreReaderChrome = suspendReaderFloatingControls();
    const restoreHostContent = suspendHostContent(host);
    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        host.removeEventListener('academy:dispose', close);
        restoreReaderChrome();
        restoreHostContent();
        vocabularySheetClosers.delete(layer);
        layer.remove();
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
    vocabularySheetClosers.set(layer, close);
    host.addEventListener('academy:dispose', close, { once: true });
    closeButton.addEventListener('click', close);
    const list = element('ol', 'academy-vocabulary-sheet-list');
    if (!options.sheet.items.length) {
        const empty = element('li', 'academy-vocabulary-sheet-empty');
        empty.textContent = options.sheet.sourceStatus === 'not-provided'
            ? options.language === 'ja' ? '確認済みの先生の単語行はまだありません。' : 'No verified teacher vocabulary rows are available yet.'
            : options.language === 'ja' ? 'この単語帳には行がありません。' : 'This source sheet has no rows.';
        list.append(empty);
    }
    options.sheet.items.forEach(word => list.append(vocabularyRow(options.language, word, options.onPlay)));
    const journey = reviewJourney(options.language, options.sheet, options.due.length, options.syllabusState);
    const actions = element('footer', 'academy-vocabulary-sheet-actions');
    actions.append(closeButton);
    if (options.onStart && canStartStudy(options.sheet, options.due.length, options.syllabusState)) {
        const begin = button(
            options.startLabel ?? (options.due.length
                ? options.language === 'ja' ? '復習を始める' : 'Start review'
                : options.language === 'ja' ? '新しい単語を学ぶ' : 'Study new words'),
            'academy-vocabulary-sheet-start',
        );
        begin.addEventListener('click', () => {
            close();
            options.onStart?.();
        });
        actions.append(begin);
    }
    sheet.append(header, list, journey, actions);
    layer.append(sheet);
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key !== 'Tab') return;
        const controls = Array.from(sheet.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]'));
        if (!controls.length) return;
        const first = controls[0]!;
        const last = controls.at(-1)!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    layer.addEventListener('keydown', onKeyDown);
    host.append(layer);
    closeButton.focus({ preventScroll: true });
    return { close };
}

function vocabularyRow(
    language: AcademyLanguage,
    word: LibraryVocabularySheetItem,
    onPlay: (word: LibraryVocabularySheetItem) => void,
): HTMLElement {
    const row = element('li', 'academy-vocabulary-sheet-word');
    row.dataset.vocabularyId = word.id;
    row.dataset.sourcePage = String(word.source.page);
    row.dataset.sourceRow = String(word.source.row);
    row.dataset.yomuStudyExpression = word.studyExpression;
    row.dataset.sourceWordsProvenance = word.fieldProvenance.words;
    const japanese = element('span', 'academy-vocabulary-sheet-japanese');
    japanese.textContent = word.expression;
    japanese.lang = 'ja';
    japanese.dataset.yomuRuntimeSurface = 'academy-copy';
    japanese.dataset.yomuFuriganaMode = 'all';
    attachLibraryReaderVocabulary(japanese, word);
    const reading = element('span', 'academy-vocabulary-sheet-reading');
    reading.textContent = word.sourcePronunciation ?? (
        language === 'ja' ? `学習用の読み：${word.reading}` : `Study reading: ${word.reading}`
    );
    reading.lang = word.sourcePronunciation ? 'ja-Latn' : 'ja';
    reading.dataset.fieldProvenance = word.sourcePronunciation ? 'source' : word.fieldProvenance.reading;
    const meaning = element('span', 'academy-vocabulary-sheet-meaning');
    if (word.sourceMeaning) {
        meaning.textContent = word.sourceMeaning;
        meaning.lang = 'en';
    } else if (language === 'ja') {
        const label = element('span');
        label.textContent = '学習用の意味：';
        label.lang = 'ja';
        const value = element('span');
        value.textContent = word.meaning;
        value.lang = 'en';
        meaning.append(label, value);
    } else {
        meaning.textContent = `Study meaning: ${word.meaning}`;
        meaning.lang = 'en';
    }
    meaning.dataset.fieldProvenance = word.sourceMeaning ? 'source' : word.fieldProvenance.meaning;
    const source = element('span', 'academy-vocabulary-sheet-source');
    source.textContent = optionsSourceLocus(language, word.source.page, word.source.row);
    row.append(japanese, reading, meaning, source);
    const audio = button(language === 'ja' ? '聞く' : 'Listen', 'academy-vocabulary-sheet-audio');
    audio.setAttribute('aria-label', language === 'ja' ? `${word.expression} を聞く` : `Listen to ${word.expression}`);
    audio.addEventListener('click', () => onPlay(word));
    row.append(audio);
    return row;
}

function reviewJourney(
    language: AcademyLanguage,
    sheet: LibraryVocabularySheet,
    dueCount: number,
    syllabusState: LibrarySyllabusState | undefined,
): HTMLElement {
    const journey = element('section', 'academy-vocabulary-sheet-journey');
    const title = element('h3', 'academy-vocabulary-sheet-journey-title');
    const canStudySheet = sheet.sourceStatus === 'exact-source' && sheet.items.length > 0;
    title.textContent = syllabusState === 'cleared'
        ? language === 'ja' ? 'いまは完了です' : 'You are caught up'
        : dueCount > 0 || canStudySheet
        ? language === 'ja' ? '単語 → 入力' : 'Word → Type'
        : language === 'ja' ? '現在の学習キュー' : 'Your current study queue';
    const note = element('p', 'academy-vocabulary-sheet-journey-note');
    note.textContent = syllabusState === 'cleared'
        ? language === 'ja'
            ? '予定より早く復習を出すことはしません。次の期限になると、よむの学習に再び表示されます。'
            : 'Yomu will not pull reviews forward. These cards return when their real due dates arrive.'
        : dueCount > 0 || canStudySheet
        ? language === 'ja'
            ? 'よむの実際の復習予定が期限を管理します。カードは「単語」から始まり、例文があるカードでは次に「入力」が表示されます。'
            : 'Yomu’s real review schedule keeps the due dates. Cards begin with Word, and Type follows when a card has an example sentence.'
        : language === 'ja'
            ? '追加できる確認済みの単語行はなく、いま復習するカードもありません。'
            : 'There are no verified rows to add and no review cards due right now.';
    const enrichment = element('p', 'academy-vocabulary-sheet-enrichment');
    enrichment.textContent = language === 'ja'
        ? '先生の資料は変更しません。よむの学習カードでは、有効なインストール済み辞書の定義や例文を追加表示できます。'
        : 'The Sensei sheet is never rewritten. Yomu Study can enrich its cards with definitions and examples from enabled installed dictionaries.';
    journey.append(title, note, enrichment);
    return journey;
}

function canStartStudy(
    sheet: LibraryVocabularySheet,
    dueCount: number,
    syllabusState: LibrarySyllabusState | undefined,
): boolean {
    return dueCount > 0 || (syllabusState !== 'cleared' && sheet.sourceStatus === 'exact-source' && sheet.items.length > 0);
}

function optionsSourceLocus(language: AcademyLanguage, page: number, row: number): string {
    return language === 'ja' ? `${page}ページ・${row}行` : `Page ${page} · row ${row}`;
}

function suspendReaderFloatingControls(): () => void {
    const controls = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-fab')).map(control => ({
        control,
        inert: control.inert,
        visibility: control.style.getPropertyValue('visibility'),
        priority: control.style.getPropertyPriority('visibility'),
    }));
    controls.forEach(({ control }) => {
        control.inert = true;
        control.style.setProperty('visibility', 'hidden', 'important');
    });
    let restored = false;
    return () => {
        if (restored) return;
        restored = true;
        controls.forEach(({ control, inert, visibility, priority }) => {
            control.inert = inert;
            if (visibility) control.style.setProperty('visibility', visibility, priority);
            else control.style.removeProperty('visibility');
        });
    };
}

function suspendHostContent(host: HTMLElement): () => void {
    const content = Array.from(host.children).filter((child): child is HTMLElement => child instanceof HTMLElement).map(child => ({
        child,
        inert: child.inert,
        hadAriaHidden: child.hasAttribute('aria-hidden'),
        ariaHidden: child.getAttribute('aria-hidden'),
    }));
    content.forEach(({ child }) => {
        child.inert = true;
        child.setAttribute('aria-hidden', 'true');
    });
    let restored = false;
    return () => {
        if (restored) return;
        restored = true;
        content.forEach(({ child, inert, hadAriaHidden, ariaHidden }) => {
            child.inert = inert;
            if (hadAriaHidden && ariaHidden !== null) child.setAttribute('aria-hidden', ariaHidden);
            else child.removeAttribute('aria-hidden');
        });
    };
}

function libraryScene(className: string): HTMLElement {
    const screen = element('section', `academy-screen ${className}`);
    screen.dataset.plate = 'library';
    screen.append(academyBackgroundPicture('library'), element('div', 'academy-library-veil'));
    return screen;
}

function button(text: string, className: string): HTMLButtonElement {
    const control = element('button', className);
    control.type = 'button';
    control.textContent = text;
    return control;
}
