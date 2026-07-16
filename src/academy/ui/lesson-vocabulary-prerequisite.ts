import type { AcademyLanguage } from '../../reader/app/academy-copy';
import type { SenseiVocabularyPrerequisite } from '../content/lesson-vocabulary-prerequisite';
import { academyBackgroundPicture, element } from './dom';
import { openVocabularySheet } from './library-screen';

export interface LessonVocabularyPrerequisiteScreenOptions {
    readonly language: AcademyLanguage;
    readonly prerequisite: SenseiVocabularyPrerequisite;
    readonly onContinue: () => void | Promise<void>;
}

/** Shows the preserved teacher sheet before an authored lesson can mount. */
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
    const eyebrow = element('p', 'academy-library-marker');
    eyebrow.textContent = language === 'ja' ? '授業の前に' : 'Before activities';
    const title = element('h1', 'academy-library-title');
    title.textContent = language === 'ja' ? '先生の単語シート' : 'Sensei vocabulary sheet';
    const note = element('p', 'academy-library-note');
    note.textContent = prerequisite.sheet.sourceStatus === 'exact-source'
        ? language === 'ja'
            ? '先生の資料の行を読んでから始めます。続けると、同じ行がよむの実際の復習予定に追加されます。'
            : 'Read the preserved teacher rows before you begin. Continuing adds those same rows to Yomu’s real review schedule.'
        : language === 'ja'
            ? 'この授業の確認済みMoodle単語シートはありません。単語を作らず、資料がないことを記録してから続けます。'
            : 'This lesson has no verified Moodle vocabulary sheet. No vocabulary will be invented; the missing source is recorded before you continue.';
    const evidence = evidenceList(language, prerequisite);
    const open = button(language === 'ja' ? '先生の単語シートを開く' : 'Open teacher vocabulary sheet');
    const continueButton = button(language === 'ja' ? 'アクティビティを始める' : 'Begin activities');
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
        ...(prerequisite.sheet.sourceStatus === 'exact-source' ? {
            onStart: continueToActivities,
            startLabel: language === 'ja' ? 'アクティビティを始める' : 'Begin activities',
        } : {}),
    }, open);
    open.addEventListener('click', showSheet);
    continueButton.addEventListener('click', continueToActivities);
    panel.append(eyebrow, title, note, evidence);
    if (prerequisite.sheet.sourceStatus === 'exact-source') panel.append(open);
    panel.append(continueButton);
    screen.append(academyBackgroundPicture('library'), panel);
    if (prerequisite.sheet.sourceStatus === 'exact-source') requestAnimationFrame(showSheet);
    else requestAnimationFrame(() => continueButton.focus({ preventScroll: true }));
    return screen;
}

function evidenceList(language: AcademyLanguage, prerequisite: SenseiVocabularyPrerequisite): HTMLElement {
    const section = element('section', 'academy-vocabulary-sheet-journey');
    const title = element('h2', 'academy-vocabulary-sheet-journey-title');
    title.textContent = language === 'ja' ? '資料の記録' : 'Source record';
    const source = element('p', 'academy-vocabulary-sheet-journey-note');
    source.textContent = prerequisite.evidence.sourceSheets.length
        ? language === 'ja'
            ? `確認したMoodle資料: ${prerequisite.evidence.sourceSheets.length}件。表示する行は、選んだ資料の保存済みの順番です。`
            : `Checked Moodle source records: ${prerequisite.evidence.sourceSheets.length}. Displayed rows retain their selected source order.`
        : language === 'ja'
            ? '確認済みのMoodle単語資料はありません。'
            : 'There is no verified Moodle vocabulary source for this lesson.';
    const gaps = element('ul', 'academy-vocabulary-sheet-list');
    for (const gap of prerequisite.evidence.gaps) {
        const item = element('li', 'academy-vocabulary-sheet-empty');
        item.textContent = gapLabel(gap, language);
        item.dataset.sourceGap = gap;
        gaps.append(item);
    }
    section.append(title, source, gaps);
    return section;
}

function gapLabel(gap: string, language: AcademyLanguage): string {
    const copy: Readonly<Record<string, readonly [string, string]>> = {
        'lesson-zero-has-no-moodle-vocabulary-sheet': ['Lesson 0 has no Moodle vocabulary sheet.', 'レッスン0にはMoodle単語シートがありません。'],
        'no-exact-source-vocabulary-sheet': ['No exact Moodle vocabulary sheet was captured for this lesson.', 'この授業の正確なMoodle単語シートは取得されていません。'],
        'source-sheet-extraction-incomplete': ['The captured Moodle vocabulary sheet is incomplete.', '取得したMoodle単語シートは完全ではありません。'],
        'ordered-vocabulary-content-mismatch': ['The captured sheet order does not cover the current lesson package exactly.', '取得したシートの順番は、現在の授業パッケージを完全にはカバーしていません。'],
        'lesson-prestudy-list-missing': ['The lesson has no source-backed pre-study list.', 'この授業には資料に基づく予習リストがありません。'],
    };
    const value = copy[gap];
    return value ? value[language === 'ja' ? 1 : 0] : gap;
}

function button(label: string): HTMLButtonElement {
    const control = element('button', 'academy-button academy-button-primary');
    control.type = 'button';
    control.textContent = label;
    return control;
}
