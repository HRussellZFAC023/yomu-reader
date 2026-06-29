import { escapeHtml } from '../dom/index';
import {
    pitchClassNameForPattern,
    pitchPatternFromPosition,
    splitMorae,
    type PitchClassName,
} from '../lookup/pitch-accent';
import { renderPitchGraphSvg } from '../popup/pitch';
import type { NewTabCopyKey } from './i18n';
import type { NewTabListenSubMode } from './state';
import type { PitchClassAccuracy, PitchSrsItem } from './pitch-srs';

export type ListenOutcome = 'correct' | 'wrong';

export interface ListenStats {
    deckSize: number;
    due: number;
    accuracy: PitchClassAccuracy[];
}

export interface ListenContrastView {
    reading: string;
    pattern: string;
    displaySpelling: string;
}

export interface ListenCardView {
    item: PitchSrsItem;
    meaning: string;
    subMode: NewTabListenSubMode;
    revealed: boolean;
    selectedPosition: number | null;
    outcome: ListenOutcome | null;
    hasAudio: boolean;
    recording: boolean;
    hasRecording: boolean;
    micEnabled: boolean;
    micUnavailable: boolean;
    contrast: ListenContrastView | null;
    stats: ListenStats;
}

type Translate = (key: NewTabCopyKey) => string;

const PITCH_CLASS_LABEL_KEYS: Record<PitchClassName, NewTabCopyKey> = {
    heiban: 'pitchClassHeiban',
    atamadaka: 'pitchClassAtamadaka',
    nakadaka: 'pitchClassNakadaka',
    odaka: 'pitchClassOdaka',
    kifuku: 'pitchClassNakadaka',
};

function pitchClassLabel(className: PitchClassName | '', t: Translate): string {
    return className ? t(PITCH_CLASS_LABEL_KEYS[className]) : '';
}

function iconButton(action: string, label: string, extraAttrs = ''): string {
    return `<button type="button" class="jpdb-reader-newtab-listen-btn" data-newtab-action="${action}" ${extraAttrs} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}

// The downstep-position picker: N+1 buttons (0=heiban … N=odaka) each previewing
// the contour that position produces for this reading, with its class name as a
// learning label. The gradeable answer is the position, not a class.
function renderPositionPicker(item: PitchSrsItem, selectedPosition: number | null, revealed: boolean, t: Translate): string {
    const moraCount = splitMorae(item.reading).length;
    if (!moraCount) return '';
    const buttons: string[] = [];
    for (let position = 0; position <= moraCount; position += 1) {
        const pattern = pitchPatternFromPosition(item.reading, position);
        const className = pitchClassNameForPattern(pattern, item.reading);
        const graph = renderPitchGraphSvg(item.reading, pattern);
        const isAnswer = position === item.pitchNumber;
        const isSelected = position === selectedPosition;
        const stateClass = revealed
            ? (isAnswer ? ' jpdb-reader-newtab-listen-pos-correct' : isSelected ? ' jpdb-reader-newtab-listen-pos-wrong' : '')
            : (isSelected ? ' jpdb-reader-newtab-listen-pos-selected' : '');
        buttons.push(`
            <button type="button" class="jpdb-reader-newtab-listen-pos${stateClass}" data-newtab-action="listen-pick" data-listen-pos="${position}" ${revealed ? 'disabled' : ''} aria-pressed="${isSelected}">
                <span class="jpdb-reader-newtab-listen-pos-num">${position}</span>
                <span class="jpdb-reader-newtab-listen-pos-graph">${graph}</span>
                <span class="jpdb-reader-newtab-listen-pos-name">${escapeHtml(pitchClassLabel(className, t))}</span>
            </button>`);
    }
    return `<div class="jpdb-reader-newtab-listen-picker" role="group" aria-label="${escapeHtml(t('listenPerceivePrompt'))}">${buttons.join('')}</div>`;
}

function renderAnswerContour(item: PitchSrsItem, t: Translate): string {
    const graph = renderPitchGraphSvg(item.reading, item.pattern);
    const className = pitchClassLabel(item.pitchClass, t);
    return `
        <div class="jpdb-reader-newtab-listen-answer">
            <span class="jpdb-reader-newtab-listen-word" lang="ja">${escapeHtml(item.displaySpelling)}</span>
            <span class="jpdb-reader-newtab-listen-reading" lang="ja">${escapeHtml(item.reading)}</span>
            <span class="jpdb-reader-newtab-listen-contour">${graph}</span>
            ${className ? `<span class="jpdb-reader-newtab-listen-class">${escapeHtml(className)}</span>` : ''}
        </div>`;
}

function renderContrastBlock(view: ListenCardView, t: Translate): string {
    if (!view.contrast) return '';
    const graph = renderPitchGraphSvg(view.contrast.reading, view.contrast.pattern);
    return `
        <div class="jpdb-reader-newtab-listen-contrast">
            ${iconButton('listen-play-both', t('listenPlayBoth'))}
            <div class="jpdb-reader-newtab-listen-contrast-pair">
                ${renderAnswerContour(view.item, t)}
                <div class="jpdb-reader-newtab-listen-answer">
                    <span class="jpdb-reader-newtab-listen-word" lang="ja">${escapeHtml(view.contrast.displaySpelling)}</span>
                    <span class="jpdb-reader-newtab-listen-reading" lang="ja">${escapeHtml(view.contrast.reading)}</span>
                    <span class="jpdb-reader-newtab-listen-contour">${graph}</span>
                </div>
            </div>
        </div>`;
}

function renderGradeRow(grades: Array<{ grade: string; key: NewTabCopyKey }>, t: Translate): string {
    const buttons = grades
        .map(entry => `<button type="button" class="jpdb-reader-newtab-listen-grade" data-newtab-action="listen-grade" data-grade="${entry.grade}">${escapeHtml(t(entry.key))}</button>`)
        .join('');
    return `<div class="jpdb-reader-newtab-listen-grades" role="group">${buttons}</div>`;
}

function renderRecordRow(view: ListenCardView, t: Translate): string {
    if (!view.micEnabled) return '';
    if (view.micUnavailable) return `<span class="jpdb-reader-newtab-listen-note">${escapeHtml(t('listenMicUnavailable'))}</span>`;
    const recordLabel = view.recording ? t('listenShadowAgain') : t('listenMicListenBack');
    return `
        <div class="jpdb-reader-newtab-listen-record">
            <button type="button" class="jpdb-reader-newtab-listen-btn${view.recording ? ' jpdb-reader-newtab-listen-recording' : ''}" data-newtab-action="listen-record" aria-pressed="${view.recording}">${escapeHtml(recordLabel)}</button>
            ${view.hasRecording ? iconButton('listen-play-recording', t('listenMicYou')) : ''}
            <span class="jpdb-reader-newtab-listen-note">${escapeHtml(t('listenMicHint'))}</span>
        </div>`;
}

// Session HUD: due-now count + a per-pattern accuracy chip per class with history
// (kotu-style "Heiban 80%"), so progress through the SRS deck is visible at a glance.
function renderListenStats(stats: ListenStats, t: Translate): string {
    if (!stats.deckSize) return '';
    const chips = stats.accuracy
        .filter(entry => entry.total > 0 && PITCH_CLASS_LABEL_KEYS[entry.pitchClass])
        .map(entry => `<span class="jpdb-reader-newtab-listen-stat">${escapeHtml(pitchClassLabel(entry.pitchClass, t))} ${Math.round((entry.correct / entry.total) * 100)}%</span>`)
        .join('');
    return `<div class="jpdb-reader-newtab-listen-stats">
        <span class="jpdb-reader-newtab-listen-stat">${stats.due} ${escapeHtml(t('listenDue'))}</span>
        ${chips}
    </div>`;
}

export function renderListenCard(view: ListenCardView, t: Translate): string {
    const promptKey: NewTabCopyKey = view.subMode === 'perceive' ? 'listenPerceivePrompt' : view.subMode === 'recall' ? 'listenRecallPrompt' : 'listenShadowPrompt';
    const sections: string[] = [
        renderListenStats(view.stats, t),
        `<div class="jpdb-reader-newtab-listen-prompt">${escapeHtml(t(promptKey))}</div>`,
    ];

    // Audio control (perceive + shadow lead with sound; recall hides it until reveal).
    if (view.subMode !== 'recall' || view.revealed) {
        sections.push(`<div class="jpdb-reader-newtab-listen-audio">
            ${view.hasAudio ? iconButton('listen-play', t('listenReplay')) : `<span class="jpdb-reader-newtab-listen-note">${escapeHtml(t('listenNoAudio'))}</span>`}
        </div>`);
    }

    if (view.subMode === 'recall') {
        sections.push(`<div class="jpdb-reader-newtab-listen-cue">
            <span class="jpdb-reader-newtab-listen-word" lang="ja">${escapeHtml(view.item.displaySpelling)}</span>
            ${view.meaning ? `<span class="jpdb-reader-newtab-listen-meaning">${escapeHtml(view.meaning)}</span>` : ''}
        </div>`);
    }

    if (view.subMode === 'shadow') {
        sections.push(renderAnswerContour(view.item, t));
        sections.push(renderRecordRow(view, t));
        sections.push(renderGradeRow([
            { grade: 'something', key: 'listenShadowAgain' },
            { grade: 'okay', key: 'listenShadowGood' },
        ], t));
        return `<div class="jpdb-reader-newtab-listen-card" data-listen-submode="shadow">${sections.join('')}</div>`;
    }

    // Perceive + Recall share the position picker.
    if (!view.revealed) {
        sections.push(renderPositionPicker(view.item, view.selectedPosition, false, t));
    } else {
        sections.push(renderPositionPicker(view.item, view.selectedPosition, true, t));
        sections.push(view.outcome === 'correct'
            ? `<div class="jpdb-reader-newtab-listen-verdict jpdb-reader-newtab-listen-verdict-correct">${escapeHtml(t('listenCorrect'))}</div>`
            : `<div class="jpdb-reader-newtab-listen-verdict jpdb-reader-newtab-listen-verdict-wrong">${escapeHtml(t('listenTryAgain'))}</div>`);
        if (view.subMode === 'perceive' && view.outcome === 'wrong' && view.contrast) {
            sections.push(renderContrastBlock(view, t));
        } else {
            sections.push(renderAnswerContour(view.item, t));
        }
        // Recall self-grades (the pick pre-suggests the outcome); Perceive was
        // auto-graded on the pick, so it just advances to the next card.
        if (view.subMode === 'recall') {
            sections.push(renderGradeRow([
                { grade: 'something', key: 'listenShadowAgain' },
                { grade: 'okay', key: 'listenShadowGood' },
            ], t));
        } else {
            sections.push(`<div class="jpdb-reader-newtab-listen-grades"><button type="button" class="jpdb-reader-newtab-listen-grade" data-newtab-action="listen-next">${escapeHtml(t('listenReveal'))}</button></div>`);
        }
    }

    return `<div class="jpdb-reader-newtab-listen-card" data-listen-submode="${view.subMode}">${sections.join('')}</div>`;
}
