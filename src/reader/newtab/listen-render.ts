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
import type { PitchSrsItem } from './pitch-srs';
import type { SpeakingPitchScore, SpeakingPitchVerdict } from './speaking-score';
import { speakerIcon } from '../ui/icons';

export type ListenOutcome = 'correct' | 'wrong';

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
    speakingScore: SpeakingPitchScore | null;
    speakingScoring: boolean;
    micEnabled: boolean;
    micUnavailable: boolean;
    contrast: ListenContrastView | null;
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
    const isPlayAction = action.startsWith('listen-play');
    const content = isPlayAction ? speakerIcon() : escapeHtml(label);
    const className = isPlayAction
        ? 'jpdb-reader-icon-btn jpdb-reader-audio-control jpdb-reader-newtab-term-audio jpdb-reader-newtab-listen-btn jpdb-reader-newtab-listen-icon-btn'
        : 'jpdb-reader-newtab-listen-btn';
    return `<button type="button" class="${className}" data-newtab-action="${action}" ${extraAttrs} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${content}</button>`;
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
        const graph = renderPitchGraphSvg(item.reading, pattern, { centerContent: true });
        const isAnswer = position === item.pitchNumber;
        const isSelected = position === selectedPosition;
        const stateClass = revealed
            ? (isAnswer ? ' jpdb-reader-newtab-listen-pos-correct' : isSelected ? ' jpdb-reader-newtab-listen-pos-wrong' : '')
            : (isSelected ? ' jpdb-reader-newtab-listen-pos-selected' : '');
        buttons.push(`
            <button type="button" class="jpdb-reader-newtab-listen-pos jpdb-pitch-${className || 'unknown'}${stateClass}" data-newtab-action="listen-pick" data-listen-pos="${position}" data-pitch-class="${className || 'unknown'}" ${revealed ? 'disabled' : ''} aria-pressed="${isSelected}">
                <span class="jpdb-reader-newtab-listen-pos-num">${position}</span>
                <span class="jpdb-reader-newtab-listen-pos-graph">${graph}</span>
                <span class="jpdb-reader-newtab-listen-pos-name">${escapeHtml(pitchClassLabel(className, t))}</span>
            </button>`);
    }
    return `<div class="jpdb-reader-newtab-listen-picker" role="group" aria-label="${escapeHtml(t('listenPerceivePrompt'))}">${buttons.join('')}</div>`;
}

function renderRecordRow(view: ListenCardView, t: Translate): string {
    if (!view.micEnabled) return '';
    if (view.micUnavailable) return `<span class="jpdb-reader-newtab-listen-note">${escapeHtml(t('listenMicUnavailable'))}</span>`;
    const recordLabel = view.recording ? t('listenMicRecording') : t('listenMicListenBack');
    return `
        <div class="jpdb-reader-newtab-listen-record">
            <button type="button" class="jpdb-reader-newtab-listen-btn${view.recording ? ' jpdb-reader-newtab-listen-recording' : ''}" data-newtab-action="listen-record" aria-pressed="${view.recording}">${escapeHtml(recordLabel)}</button>
            ${view.hasRecording ? iconButton('listen-play-recording', t('listenMicYou')) : ''}
            ${renderSpeakingScore(view, t)}
        </div>`;
}

function renderSpeakingScore(view: ListenCardView, t: Translate): string {
    if (view.speakingScoring) {
        return `<span class="jpdb-reader-newtab-listen-score" data-speaking-score-state="pending">${escapeHtml(t('listenMicScoring'))}</span>`;
    }
    if (!view.hasRecording) return '';
    if (!view.speakingScore) {
        return `<span class="jpdb-reader-newtab-listen-score" data-speaking-score-state="unknown">${escapeHtml(t('listenMicNoPitch'))}</span>`;
    }
    const labelKey: Record<SpeakingPitchVerdict, NewTabCopyKey> = {
        good: 'listenMicScoreGood',
        close: 'listenMicScoreClose',
        retry: 'listenMicScoreRetry',
    };
    const state = view.speakingScore.verdict;
    return `
        <div class="jpdb-reader-newtab-listen-score-panel" data-speaking-score-state="${state}">
            <span class="jpdb-reader-newtab-listen-score" data-speaking-score-state="${state}">${escapeHtml(t(labelKey[state]))} ${view.speakingScore.score}%</span>
            <span class="jpdb-reader-newtab-listen-score-tip">${escapeHtml(t(speakingScoreTipKey(view.speakingScore)))}</span>
            ${state === 'good' ? '' : renderSpeakingContourComparison(view.item, view.speakingScore, t)}
        </div>`;
}

function renderSpeakingContourComparison(item: PitchSrsItem, score: SpeakingPitchScore, t: Translate): string {
    const expectedGraph = renderPitchGraphSvg(item.reading, score.expectedPattern);
    const observedGraph = renderPitchGraphSvg(item.reading, score.observedPattern);
    return `
        <div class="jpdb-reader-newtab-listen-score-contours">
            <span>${escapeHtml(t('listenMicExpected'))}</span>
            <span class="jpdb-reader-newtab-listen-score-graph">${expectedGraph}</span>
            <span>${escapeHtml(t('listenMicYouContour'))}</span>
            <span class="jpdb-reader-newtab-listen-score-graph">${observedGraph}</span>
        </div>`;
}

function speakingScoreTipKey(score: SpeakingPitchScore): NewTabCopyKey {
    if (score.verdict === 'good') return 'listenMicTipMatched';
    const expected = score.expectedPattern;
    const observed = score.observedPattern;
    if (expected[0] !== observed[0]) return expected[0] === 'L' ? 'listenMicTipStartLow' : 'listenMicTipStartHigh';
    if (expected.includes('HL') && !observed.includes('HL')) return 'listenMicTipMakeDropClear';
    if (expected.includes('LH') && !observed.includes('LH')) return 'listenMicTipMakeRiseClear';
    return 'listenMicTipListenAgain';
}

export function renderListenCard(view: ListenCardView, t: Translate): string {
    const sections: string[] = [];

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
        sections.push(`<div class="jpdb-reader-newtab-listen-cue">
            <span class="jpdb-reader-newtab-listen-word" lang="ja">${escapeHtml(view.item.displaySpelling)}</span>
        </div>`);
        sections.push(renderRecordRow(view, t));
        return `<div class="jpdb-reader-newtab-listen-card" data-listen-submode="shadow">${sections.join('')}</div>`;
    }

    // Perceive (the pitch-SELECTION step): a clear, audio-first prompt above the
    // downstep picker so the step is self-explanatory ("Which pitch did you
    // hear?"), with the word shown so the learner knows what they are picking for.
    // The picker shows the reading's morae by design (you cannot choose a downstep
    // position without them) — this is the intended kotu-style mechanic, not a
    // pre-reveal reading leak of the word answer.
    if (view.subMode === 'perceive') {
        sections.push(`<div class="jpdb-reader-newtab-listen-cue">
            <span class="jpdb-reader-newtab-listen-word" lang="ja">${escapeHtml(view.item.displaySpelling)}</span>
            <span class="jpdb-reader-newtab-listen-prompt">${escapeHtml(t('listenPerceivePrompt'))}</span>
        </div>`);
    }

    // Perceive + Recall share the position picker. On a pick the choice is saved
    // but its correctness is NOT surfaced here — the single final-reveal boundary
    // owns all correctness feedback (backlog GAP 2: no correctness leak pre-reveal).
    sections.push(renderPositionPicker(view.item, view.selectedPosition, false, t));
    if (view.revealed) {
        sections.push(`<div class="jpdb-reader-newtab-listen-verdict">${escapeHtml(t('listenChoiceSaved'))}</div>`);
    }

    return `<div class="jpdb-reader-newtab-listen-card" data-listen-submode="${view.subMode}">${sections.join('')}</div>`;
}
