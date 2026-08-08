import { resolveUiLanguage, uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import { escapeHtml } from '../dom/index';
import { escapeWithBreaks, formatSubtitleTime, type SubtitleCue } from './subtitle-cues';
import { subtitleContentAttributes, type SubtitleContentLanguage } from './subtitle-language-context';
import { SUBTITLE_SECONDARY_BLURRED_CLASS, SUBTITLE_SECONDARY_CLEAR_CLASS } from './subtitle-rendering';

export interface SubtitleShadowParsedLine {
    html: string;
    parsedKeyAttribute: string;
    provisionalAttribute: string;
}

type SubtitleShadowAction = 'replay' | 'loop' | 'stop' | 'auto-pause' | 'record' | 'stop-record' | 'play-recording' | 'record-unavailable';

const SHADOW_ACTION_LABELS: Record<SubtitleShadowAction, Record<'en' | 'ja', string>> = {
    replay: { en: 'Replay', ja: '再生' },
    loop: { en: 'Loop', ja: 'ループ' },
    stop: { en: 'Stop', ja: '停止' },
    'auto-pause': { en: 'Auto pause', ja: '自動停止' },
    record: { en: 'Record', ja: '録音' },
    'stop-record': { en: 'Stop', ja: '録音停止' },
    'play-recording': { en: 'Play yours', ja: '録音を再生' },
    'record-unavailable': { en: 'Mic unavailable', ja: 'マイクを使用できません' },
};

const SHADOW_CONTEXT_LABELS: Record<'en' | 'ja', Record<'prev' | 'next', string>> = {
    en: { prev: 'Previous line', next: 'Next line' },
    ja: { prev: '前の行へ', next: '次の行へ' },
};

export function renderSubtitleShadowCueCard(options: {
    cue: SubtitleCue;
    parseKey: string;
    parsedLine: SubtitleShadowParsedLine;
    textVisible: boolean;
    secondaryText?: string;
    secondaryVisible: boolean;
    secondaryBlurred: boolean;
    neighbors: { prev?: SubtitleCue; next?: SubtitleCue };
    language: InterfaceLanguage;
    primaryContent: SubtitleContentLanguage;
    secondaryContent: SubtitleContentLanguage;
    actionsHtml: string;
}): string {
    const hiddenClass = options.textVisible ? '' : ' jpdb-subtitle-shadow-line-hidden';
    return `
        <div class="jpdb-subtitle-shadow-card">
            ${renderOptionalShadowContextLine(options.neighbors.prev, 'prev', options.language, options.primaryContent)}
            <div class="jpdb-subtitle-shadow-current">
                <span class="jpdb-subtitle-shadow-time">${formatSubtitleTime(options.cue.start)}-${formatSubtitleTime(options.cue.end)}</span>
                <strong class="jpdb-subtitle-shadow-line jpdb-subtitle-row-text${hiddenClass}" ${subtitleContentAttributes(options.primaryContent)} data-transcript-text data-parse-key="${escapeHtml(options.parseKey)}"${options.parsedLine.parsedKeyAttribute}${options.parsedLine.provisionalAttribute}>${options.parsedLine.html}</strong>
                ${renderShadowSecondaryLine(options)}
            </div>
            ${renderOptionalShadowContextLine(options.neighbors.next, 'next', options.language, options.primaryContent)}
            <div class="jpdb-subtitle-shadow-actions">${options.actionsHtml}</div>
        </div>
    `;
}

export function subtitleShadowActionLabel(
    language: InterfaceLanguage,
    action: SubtitleShadowAction,
): string {
    return SHADOW_ACTION_LABELS[action][resolveUiLanguage(language)];
}

function renderOptionalShadowContextLine(
    cue: SubtitleCue | undefined,
    direction: 'prev' | 'next',
    language: InterfaceLanguage,
    content: SubtitleContentLanguage,
): string {
    if (!cue) return '';
    return renderShadowContextLine(cue, direction, language, content);
}

function renderShadowContextLine(
    cue: SubtitleCue,
    direction: 'prev' | 'next',
    language: InterfaceLanguage,
    content: SubtitleContentLanguage,
): string {
    const text = cue.text.trim();
    if (!text) return '';
    const label = SHADOW_CONTEXT_LABELS[resolveUiLanguage(language)][direction];
    return `<button type="button" class="jpdb-subtitle-shadow-context jpdb-subtitle-shadow-context-${direction}" data-action="shadow-goto" data-shadow-goto="${direction}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${subtitleContentAttributes(content)}>${escapeWithBreaks(text)}</button>`;
}

function renderShadowSecondaryLine(options: {
    secondaryText?: string;
    secondaryVisible: boolean;
    secondaryBlurred: boolean;
    secondaryContent: SubtitleContentLanguage;
    language: InterfaceLanguage;
}): string {
    const text = options.secondaryVisible ? options.secondaryText?.trim() : '';
    if (!text) return '';
    const blurClass = options.secondaryBlurred ? SUBTITLE_SECONDARY_BLURRED_CLASS : SUBTITLE_SECONDARY_CLEAR_CLASS;
    const label = uiText(options.language, 'toggleNativeSubtitleBlur');
    return `<button class="jpdb-subtitle-shadow-secondary ${blurClass}" type="button" data-action="toggle-native-blur" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${options.secondaryBlurred}" ${subtitleContentAttributes(options.secondaryContent)}>${escapeWithBreaks(text)}</button>`;
}
