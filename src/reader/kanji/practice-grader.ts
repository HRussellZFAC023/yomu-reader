import { installKanjiDoodle, type DoodleStroke } from './doodle';
import { assessKanjiStrokes, type KanjiStrokeAssessment } from './stroke-grader';
import type { KanjiVGInfo } from './vg';
import type { InterfaceLanguage } from '../types';

export interface KanjiPracticeDoodleController {
    reassess: () => void;
    clear: () => void;
}

export function installKanjiPracticeDoodle(
    root: HTMLElement,
    getLanguage: () => InterfaceLanguage,
    getKanjiVGInfo: () => KanjiVGInfo | null,
): KanjiPracticeDoodleController {
    let latestStrokes: DoodleStroke[] = [];

    const clear = (): void => {
        latestStrokes = [];
        clearKanjiPracticeAssessment(root);
    };
    const reassess = (): void => {
        renderKanjiPracticeAssessment(root, getKanjiVGInfo(), latestStrokes);
    };

    installKanjiDoodle(root, getLanguage, {
        onChange: strokes => {
            latestStrokes = strokes;
            reassess();
        },
        onClear: clear,
    });

    return { reassess, clear };
}

function renderKanjiPracticeAssessment(root: HTMLElement, info: KanjiVGInfo | null, strokes: DoodleStroke[]): void {
    if (!info || !strokes.length) {
        clearKanjiPracticeAssessment(root);
        return;
    }
    if (shouldWaitForMorePracticeStrokes(strokes, info.strokeCount)) {
        clearKanjiPracticeAssessment(root);
        return;
    }
    renderKanjiPracticeResult(root, assessKanjiStrokes(strokes, info.strokeCount, info.strokeShapes));
}

function renderKanjiPracticeResult(root: HTMLElement, assessment: KanjiStrokeAssessment): void {
    const section = kanjiPracticeSection(root);
    const result = section?.querySelector<HTMLElement>('[data-newtab-doodle-result]');
    section?.classList.toggle('jpdb-reader-doodle-pass', assessment.passed);
    section?.classList.toggle('jpdb-reader-doodle-fail', !assessment.passed);
    if (result) result.textContent = `${assessment.passed ? '✓' : '✕'} ${assessment.message}`;
}

function clearKanjiPracticeAssessment(root: HTMLElement): void {
    const section = kanjiPracticeSection(root);
    const result = section?.querySelector<HTMLElement>('[data-newtab-doodle-result]');
    section?.classList.remove('jpdb-reader-doodle-pass', 'jpdb-reader-doodle-fail');
    if (result) result.textContent = '';
}

function kanjiPracticeSection(root: HTMLElement): HTMLElement | null {
    return root.matches('.jpdb-reader-kanjivg')
        ? root
        : root.querySelector<HTMLElement>('.jpdb-reader-kanjivg');
}

function shouldWaitForMorePracticeStrokes(strokes: DoodleStroke[], expectedStrokes: number): boolean {
    return expectedStrokes > 0 && strokes.filter(stroke => stroke.length > 1).length < expectedStrokes;
}
