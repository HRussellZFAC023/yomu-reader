import { escapeHtml } from '../dom/index';
import { formatUiText, resolveUiLanguage, uiText } from '../app/i18n';
import { formatTrackKind, trackStatusText, type SubtitleTrackKind, type SubtitleTrackLoadingState } from './subtitle-track-metadata';
import { renderDrawerHead } from './subtitle-surface';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { escapeRegExp } from './youtube-config';
import { languageDisplayName } from '../languages/locale';

export interface SubtitleTrackPanelTrack {
    id: string;
    label: string;
    kind: SubtitleTrackKind;
    language?: string;
    loadingState?: SubtitleTrackLoadingState;
    timing?: SubtitleTrackTimingControlState;
}

export interface SubtitleTrackTimingControlState {
    offsetSeconds: number;
    canAdjust: boolean;
    canAlignPrevious: boolean;
    canAlignNext: boolean;
}

export interface SubtitleTrackPanelRenderState {
    tracks: SubtitleTrackPanelTrack[];
    autoDetected: number;
    selectedTrackId: string;
    secondaryTrackId: string;
    hasTranscriptSurface: boolean;
    pausePanelEnabled: boolean;
    placement: ReaderSettings['subtitleTranscriptPlacement'];
    optionsMenuOpen: boolean;
    language: InterfaceLanguage;
    targetLanguage: string;
    outputLanguage: string;
    animeSearchQuery?: string;
    // Windowed render for videos with many (auto-translated) caption tracks: only
    // tracks[start..end) become rows; spacers reserve the off-window scroll height.
    // `tracks` stays the FULL list so the drawer meta + count resolve the selected
    // primary/secondary even when they are scrolled out of the window.
    virtual?: { start: number; end: number; topSpacer: number; bottomSpacer: number };
}

export function renderSubtitleTrackPanel(state: SubtitleTrackPanelRenderState): string {
    const language = state.language;
    const displayLocale = resolveUiLanguage(language);
    const targetName = languageDisplayName(state.targetLanguage, displayLocale);
    const outputName = languageDisplayName(state.outputLanguage, displayLocale);
    return `
        ${renderDrawerHead({
            mode: 'tracks',
            title: uiText(language, 'subtitlesTitle'),
            meta: subtitleDrawerMetaText({
                mode: 'tracks',
                count: state.tracks.length,
                tracks: state.tracks,
                selectedTrackId: state.selectedTrackId,
                secondaryTrackId: state.secondaryTrackId,
                language,
            }),
            metaTitle: subtitleDrawerMetaText({
                mode: 'tracks',
                count: state.tracks.length,
                tracks: state.tracks,
                selectedTrackId: state.selectedTrackId,
                secondaryTrackId: state.secondaryTrackId,
                language,
                compact: false,
            }),
            canShowLines: state.hasTranscriptSurface,
            showModeTabs: state.hasTranscriptSurface,
            options: {
                placement: state.placement,
                pausePanelEnabled: state.pausePanelEnabled,
                menuOpen: state.optionsMenuOpen,
                language,
            },
        })}
        <div class="jpdb-subtitle-list-scroll"${state.virtual ? ' data-virtualized="true"' : ''}>
            <div class="jpdb-subtitle-track-tools">
                <button type="button" data-action="load">${escapeHtml(formatUiText(language, 'loadTargetSubtitles', { language: targetName }))}</button>
                <button type="button" data-action="load-secondary">${escapeHtml(formatUiText(language, 'loadOutputSubtitles', { language: outputName }))}</button>
                ${state.targetLanguage === 'ja' ? `<a href="${escapeHtml(jimakuAnimeSearchUrl(state.animeSearchQuery))}" target="_blank" rel="noopener" data-jimaku-anime-search>${escapeHtml(uiText(language, 'searchAnimeSubtitles'))}</a>` : ''}
            </div>
            <div class="jpdb-subtitle-track-summary">${escapeHtml(trackPanelSummaryText(state.autoDetected, language))}</div>
            <div class="jpdb-subtitle-track-hint">${escapeHtml(uiText(language, 'subtitleTracksHint'))}</div>
            ${state.virtual ? trackVirtualSpacer(state.virtual.topSpacer) : ''}
            ${state.tracks.length ? trackPanelRows(state).map(track => renderSubtitleTrackRow(track, state)).join('') : ''}
            ${state.virtual ? trackVirtualSpacer(state.virtual.bottomSpacer) : ''}
        </div>
        <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeSubtitleTracksPanel'))}"></div>
    `;
}

function trackPanelRows(state: SubtitleTrackPanelRenderState): SubtitleTrackPanelTrack[] {
    return state.virtual ? state.tracks.slice(state.virtual.start, state.virtual.end) : state.tracks;
}

function trackVirtualSpacer(height: number): string {
    return height > 0
        ? `<div class="jpdb-subtitle-list-spacer" aria-hidden="true" style="height:${Math.round(height)}px"></div>`
        : '';
}

function jimakuAnimeSearchUrl(query = ''): string {
    const trimmed = query.trim();
    if (!trimmed) return 'https://jimaku.cc/';
    return `https://jimaku.cc/opensearch/redirect?anime=true&query=${encodeURIComponent(trimmed)}`;
}

export function subtitleAnimeSearchQuery(video?: HTMLVideoElement, pageTitle = document.title): string {
    const raw = [
        video?.dataset.yomuAnimeSearch,
        video?.dataset.yomuVideoTitle,
        video?.title,
        pageTitle,
    ].find(value => Boolean(value)) ?? '';
    return raw
        .replace(/\.(?:mkv|mp4|m4v|mov|webm|ogv)$/iu, '')
        .replace(/[-|]\s*(?:YouTube|Yomu Video|よむ 動画)\s*$/iu, '')
        .replace(/\[[^\]]*\]/gu, ' ')
        .replace(/[._]+/gu, ' ')
        .replace(/^\s*(?:watch|stream)\s+/iu, '')
        .replace(/\s+(?:episode|ep\.?)\s*\d+(?:\.\d+)?\b.*$/iu, '')
        .replace(/\s*[-|·]\s*(?:watch|stream|free|anime|online|subbed|dubbed|hd)\b.*$/iu, '')
        .replace(/\b(?:english|eng)\s+(?:subbed|sub|dubbed|dub)\b/giu, ' ')
        .replace(/\b(?:subbed|dubbed)\b/giu, ' ')
        .replace(/\s+\b(?:online|free|hd)\b\s*$/iu, '')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 120);
}

export function subtitleDrawerMetaText(options: {
    mode: 'lines' | 'tracks';
    count: number;
    tracks: SubtitleTrackPanelTrack[];
    selectedTrackId: string;
    secondaryTrackId: string;
    language: InterfaceLanguage;
    compact?: boolean;
}): string {
    const primaryTrack = options.tracks.find(track => track.id === options.selectedTrackId);
    const secondaryTrack = options.tracks.find(track => track.id === options.secondaryTrackId);
    const label = options.compact === false ? localizedSubtitleTrackLabel : compactSubtitleTrackLabel;
    const primary = primaryTrack ? label(primaryTrack, options.language) : undefined;
    const secondary = secondaryTrack ? label(secondaryTrack, options.language) : undefined;
    return drawerMetaParts(options.mode, options.count, primary, secondary, options.language).filter(Boolean).join(' \u00b7 ');
}

function renderSubtitleTrackRow(track: SubtitleTrackPanelTrack, state: SubtitleTrackPanelRenderState): string {
    const isPrimary = track.id === state.selectedTrackId;
    const isSecondary = track.id === state.secondaryTrackId;
    const language = state.language;
    return `
        <div class="jpdb-subtitle-track-row ${isPrimary || isSecondary ? 'active' : ''}" data-track-id="${escapeHtml(track.id)}">
            <div class="jpdb-subtitle-track-title">
                    <strong title="${escapeHtml(localizedSubtitleTrackLabel(track, language))}">${escapeHtml(compactSubtitleTrackLabel(track, language))}</strong>
                    <span>${escapeHtml(formatTrackKind(track.kind, language))}</span>
                </div>
            <span>${escapeHtml(trackLanguageLabel(track, language))}${trackRoleText(isPrimary, isSecondary, language)}${trackStatusText(track, language)}</span>
            <div class="jpdb-subtitle-track-actions">
                <button type="button" data-action="primary-track" aria-pressed="${isPrimary}">${escapeHtml(uiText(language, isPrimary ? 'unsetPrimarySubtitles' : 'primarySubtitles'))}</button>
                <button type="button" data-action="secondary-track" aria-pressed="${isSecondary}">${escapeHtml(uiText(language, isSecondary ? 'unsetNativeSubtitles' : 'nativeSubtitles'))}</button>
            </div>
            ${isPrimary || isSecondary ? renderSubtitleTrackTimingControls(track, language) : ''}
        </div>
    `;
}

function renderSubtitleTrackTimingControls(track: SubtitleTrackPanelTrack, language: InterfaceLanguage): string {
    const timing = track.timing;
    if (!timing) return '';
    const disabled = timing.canAdjust ? '' : 'disabled';
    const timingLabel = uiText(language, 'subtitleTrackTiming');
    const previousLabel = uiText(language, 'subtitleOffsetPrevious');
    const nextLabel = uiText(language, 'subtitleOffsetNext');
    const previousShort = uiText(language, 'subtitleOffsetPreviousShort');
    const nextShort = uiText(language, 'subtitleOffsetNextShort');
    const earlierLabel = uiText(language, 'subtitleOffsetEarlier');
    const laterLabel = uiText(language, 'subtitleOffsetLater');
    const resetLabel = uiText(language, 'resetSubtitleOffset');
    return `
        <div class="jpdb-subtitle-track-offset" role="group" aria-label="${escapeHtml(timingLabel)}">
            <span class="jpdb-subtitle-track-offset-value" title="${escapeHtml(timingLabel)}">${escapeHtml(formatSubtitleTrackOffset(timing.offsetSeconds))}</span>
            <button type="button" data-action="offset-previous" title="${escapeHtml(previousLabel)}" aria-label="${escapeHtml(previousLabel)}" ${timing.canAlignPrevious ? '' : 'disabled'}>‹ ${escapeHtml(previousShort)}</button>
            <button type="button" data-action="offset-earlier" title="${escapeHtml(earlierLabel)}" aria-label="${escapeHtml(earlierLabel)}" ${disabled}>−100</button>
            <button type="button" data-action="offset-later" title="${escapeHtml(laterLabel)}" aria-label="${escapeHtml(laterLabel)}" ${disabled}>+100</button>
            <button type="button" data-action="offset-next" title="${escapeHtml(nextLabel)}" aria-label="${escapeHtml(nextLabel)}" ${timing.canAlignNext ? '' : 'disabled'}>${escapeHtml(nextShort)} ›</button>
            <button type="button" data-action="offset-reset" title="${escapeHtml(resetLabel)}" aria-label="${escapeHtml(resetLabel)}" ${disabled}>0</button>
        </div>
    `;
}

function formatSubtitleTrackOffset(seconds: number): string {
    const roundedMs = Math.round(seconds * 1000);
    const value = roundedMs / 1000;
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}s`;
}

function trackPanelSummaryText(autoDetected: number, language: InterfaceLanguage): string {
    return autoDetected
        ? autoDetected === 1
            ? uiText(language, 'autoDetectedOptionSingular')
            : `${autoDetected} ${uiText(language, 'autoDetectedOptions')}`
        : uiText(language, 'autoDetectedTracksWillAppear');
}

function trackLanguageLabel(track: SubtitleTrackPanelTrack, language: InterfaceLanguage): string {
    return track.language ? track.language.toUpperCase() : uiText(language, 'detected');
}

function localizedSubtitleTrackLabel(track: SubtitleTrackPanelTrack, language: InterfaceLanguage): string {
    if (language !== 'ja') return track.label;
    if (track.label === 'YouTube subtitles') return uiText(language, 'youTubeSubtitles');
    return track.label.replace(/ \u00b7 auto-generated$/u, ` \u00b7 ${uiText(language, 'autoGeneratedSubtitle')}`);
}

function compactSubtitleTrackLabel(track: SubtitleTrackPanelTrack, language: InterfaceLanguage): string {
    const label = localizedSubtitleTrackLabel(track, language);
    return compactAutoTranslatedTrackLabel(label)
        || compactSyntheticTranslationTrackLabel(label, language)
        || compactAutoGeneratedTrackLabel(label, language)
        || label;
}

function compactAutoTranslatedTrackLabel(label: string): string {
    const match = label.match(/^\s*(.+?)\s+\u00b7\s+auto-translated from\s+(.+?)\s*$/iu);
    if (!match) return '';
    return `${match[1]} <- ${compactTrackSourceLabel(match[2] ?? '')}`;
}

function compactSyntheticTranslationTrackLabel(label: string, language: InterfaceLanguage): string {
    const prefix = uiText(language, 'translation');
    const match = label.match(new RegExp(`^${escapeRegExp(prefix)}\\s*\\((.+)\\)$`, 'iu'));
    if (!match) return '';
    return `${prefix}: ${compactTrackSourceLabel(match[1] ?? '')}`;
}

function compactAutoGeneratedTrackLabel(label: string, language: InterfaceLanguage): string {
    const localizedAuto = uiText(language, 'autoGeneratedSubtitle');
    const patterns = [
        new RegExp(`^(.+?)\\s+\\u00b7\\s+${escapeRegExp(localizedAuto)}$`, 'u'),
        /^(.+?)\s+\u00b7\s+auto-generated$/iu,
    ];
    const match = patterns.map(pattern => label.match(pattern)).find(Boolean);
    return match ? `${match[1]} (${localizedAuto})` : '';
}

function compactTrackSourceLabel(label: string): string {
    return label
        .replace(/\s+\u00b7\s+auto-generated$/iu, '')
        .replace(/\s+\u00b7\s+.+$/u, '')
        .trim();
}

function trackRoleText(isPrimary: boolean, isSecondary: boolean, language: InterfaceLanguage): string {
    return [
        isPrimary ? ` \u00b7 ${uiText(language, 'primaryOverlay')}` : '',
        isSecondary ? ` \u00b7 ${uiText(language, 'nativeOverlay')}` : '',
    ].join('');
}

function drawerMetaParts(
    mode: 'lines' | 'tracks',
    count: number,
    primary: string | undefined,
    secondary: string | undefined,
    language: InterfaceLanguage,
): string[] {
    return mode === 'tracks'
        ? drawerTrackMetaParts(count, primary, secondary, language)
        : drawerLineMetaParts(count, primary, secondary, language);
}

function drawerTrackMetaParts(count: number, primary: string | undefined, secondary: string | undefined, language: InterfaceLanguage): string[] {
    return [
        `${count} ${uiText(language, count === 1 ? 'subtitleOptionSingular' : 'subtitleOptionPlural')}`,
        primary ? `${uiText(language, 'primarySubtitles')}: ${primary}` : uiText(language, 'choosePrimarySubtitles'),
        secondary ? `${uiText(language, 'nativeSubtitles')}: ${secondary}` : '',
    ];
}

function drawerLineMetaParts(count: number, primary: string | undefined, secondary: string | undefined, language: InterfaceLanguage): string[] {
    return [
        primary || uiText(language, 'transcript'),
        `${count} ${uiText(language, count === 1 ? 'subtitleLineSingular' : 'subtitleLinePlural')}`,
        secondary ? `${uiText(language, 'nativeSubtitles')}: ${secondary}` : '',
    ];
}
