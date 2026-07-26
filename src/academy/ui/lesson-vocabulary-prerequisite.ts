import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { SenseiVocabularyPrerequisite } from '../content/lesson-vocabulary-prerequisite';
import { academyBackgroundPicture, element } from './dom';
import { openVocabularySheet } from './library-screen';

export interface LessonVocabularyPrerequisiteScreenOptions {
    readonly language: AcademyLanguage;
    readonly prerequisite: SenseiVocabularyPrerequisite;
    readonly onContinue: () => void | Promise<void>;
}

/** Gives the learner a short vocabulary warm-up before an authored lesson mounts. */
export function renderLessonVocabularyPrerequisiteScreen(
    options: LessonVocabularyPrerequisiteScreenOptions,
): HTMLElement {
    const { language, prerequisite } = options;
    const screen = element('section', 'academy-screen academy-library-screen academy-lesson-vocabulary-prerequisite');
    screen.dataset.academyScreen = 'lesson-vocabulary-prerequisite';
    screen.dataset.lessonId = prerequisite.lessonId;
    screen.dataset.sourceStatus = prerequisite.sheet.sourceStatus;
    screen.dataset.parityStatus = prerequisite.evidence.status;

    const panel = element('article', 'academy-library-desk');
    const hasWords = prerequisite.sheet.sourceStatus === 'exact-source';
    const eyebrow = element('p', 'academy-library-marker');
    eyebrow.textContent = language === 'ja' ? 'レッスンの前に' : 'Before the lesson';
    const title = element('h1', 'academy-library-title');
    title.textContent = hasWords
        ? language === 'ja' ? '今日のことば' : 'Today’s words'
        : language === 'ja' ? '準備できました' : 'You’re ready';
    const note = element('p', 'academy-library-note');
    note.textContent = hasWords
        ? language === 'ja'
            ? '今日のことばを見てから始めましょう。続けると、復習にも追加されます。'
            : 'Look through today’s words. They’ll join your reviews when you continue.'
        : language === 'ja'
            ? 'このレッスンの前に覚える新しいことばはありません。'
            : 'There are no new words before this lesson.';
    const summary = vocabularySummary(language, prerequisite);
    const open = button(language === 'ja' ? 'ことばを見る' : 'View today’s words');
    const continueButton = button(language === 'ja' ? 'レッスンを始める' : 'Start lesson');
    open.dataset.vocabularyPrerequisiteOpen = '';
    continueButton.dataset.vocabularyPrerequisiteContinue = '';
    let continuing = false;
    const continueToActivities = () => {
        if (continuing) return;
        continuing = true;
        open.disabled = true;
        continueButton.disabled = true;
        void Promise.resolve(options.onContinue()).catch(() => {
            continuing = false;
            open.disabled = false;
            continueButton.disabled = false;
            continueButton.focus();
        });
    };
    const showSheet = () => openVocabularySheet(screen, {
        language,
        sheet: prerequisite.sheet,
        due: [],
        syllabusState: prerequisite.sheet.sourceStatus === 'exact-source' ? 'new' : 'empty',
        onPlay() {},
        ...(hasWords ? {
            onStart: continueToActivities,
            startLabel: language === 'ja' ? 'レッスンを始める' : 'Start lesson',
        } : {}),
    }, open);
    open.addEventListener('click', showSheet);
    continueButton.addEventListener('click', continueToActivities);
    panel.append(eyebrow, title, note, summary);
    if (hasWords) panel.append(open);
    panel.append(continueButton);
    screen.append(academyBackgroundPicture('library'), panel);
    if (hasWords) requestAnimationFrame(showSheet);
    else requestAnimationFrame(() => continueButton.focus({ preventScroll: true }));
    return screen;
}

function vocabularySummary(language: AcademyLanguage, prerequisite: SenseiVocabularyPrerequisite): HTMLElement {
    const section = element('section', 'academy-vocabulary-sheet-journey');
    const title = element('h2', 'academy-vocabulary-sheet-journey-title');
    const copy = element('p', 'academy-vocabulary-sheet-journey-note');
    const count = prerequisite.sheet.items.length;
    title.textContent = count > 0
        ? language === 'ja' ? '今日のリスト' : 'Ready to study'
        : language === 'ja' ? 'ウォームアップなし' : 'No warm-up';
    copy.textContent = count > 0
        ? language === 'ja' ? `${count}語あります。` : `${count} ${count === 1 ? 'word' : 'words'} in today’s list.`
        : language === 'ja' ? 'そのまま始められます。' : 'Start when you’re ready.';
    section.append(title, copy);
    return section;
}

function button(label: string): HTMLButtonElement {
    const control = element('button', 'academy-button academy-button-primary');
    control.type = 'button';
    control.textContent = label;
    return control;
}
