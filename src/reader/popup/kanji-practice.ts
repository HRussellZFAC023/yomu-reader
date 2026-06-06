import { escapeHtml } from '../dom';
import { uiText } from '../i18n';
import type { KanjiVGInfo } from '../kanjivg';
import type { InterfaceLanguage } from '../types';
import { sourceStateAttribute } from './source-state';

export function renderKanjiPractice(info: KanjiVGInfo | null, kanji: string, language: InterfaceLanguage, initiallyExpanded = true, sourceStateKey?: string, title = uiText(language, 'strokePractice')): string {
    const ghost = info?.svg || `<div class="jpdb-reader-doodle-text-ghost">${escapeHtml(kanji)}</div>`;
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-kanjivg" ${sourceStateAttribute(sourceStateKey, initiallyExpanded)} ${initiallyExpanded ? 'open' : ''}>
            <summary class="jpdb-reader-local-title">${escapeHtml(title)}</summary>
            <div class="jpdb-reader-doodle-stage" data-kanji="${escapeHtml(kanji)}">
                <div class="jpdb-reader-doodle-ghost" aria-hidden="true">${ghost}</div>
                <canvas class="jpdb-reader-doodle-canvas" aria-label="${escapeHtml(`${uiText(language, 'practiceDrawing')} ${kanji}`)}"></canvas>
            </div>
            <div class="jpdb-reader-doodle-tools">
                <span class="jpdb-reader-help">${info ? `${info.strokeCount} ${uiText(language, 'strokes')}` : uiText(language, 'textTrace')}</span>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-trace>${uiText(language, 'hideTrace')}</button>
                <button class="jpdb-reader-btn jpdb-reader-doodle-control" type="button" data-doodle-clear>${uiText(language, 'clear')}</button>
            </div>
            <div class="jpdb-reader-newtab-doodle-result" data-newtab-doodle-result></div>
        </details>
    `;
}
