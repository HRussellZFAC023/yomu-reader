import { escapeHtml } from './dom';
import { uiText } from './i18n';
import { formatTrackKind, trackStatusText, type SubtitleTrackKind, type SubtitleTrackLoadingState } from './subtitle-track-metadata';
import {
    renderPanelCloseButton,
    renderPanelModeControls,
    renderPanelNavigationControls,
    renderPausePanelToggle,
} from './subtitle-surface';
import type { InterfaceLanguage } from './types';

export interface SubtitleTrackPanelTrack {
    id: string;
    label: string;
    kind: SubtitleTrackKind;
    language?: string;
    loadingState?: SubtitleTrackLoadingState;
}

export interface SubtitleTrackPanelRenderState {
    tracks: SubtitleTrackPanelTrack[];
    autoDetected: number;
    selectedTrackId: string;
    secondaryTrackId: string;
    hasTranscriptSurface: boolean;
    hasNavigableLines: boolean;
    pausePanelEnabled: boolean;
    language: InterfaceLanguage;
}

export function renderSubtitleTrackPanel(state: SubtitleTrackPanelRenderState): string {
    const language = state.language;
    return `
        <div class="jpdb-subtitle-drawer-head">
            <div class="jpdb-subtitle-drawer-brand">
                <strong class="jpdb-subtitle-drawer-title">${escapeHtml(uiText(language, 'subtitlesTitle'))}</strong>
                <span class="jpdb-subtitle-drawer-meta">${escapeHtml(subtitleDrawerMetaText({
                    mode: 'tracks',
                    count: state.tracks.length,
                    tracks: state.tracks,
                    selectedTrackId: state.selectedTrackId,
                    secondaryTrackId: state.secondaryTrackId,
                    language,
                }))}</span>
            </div>
            <div class="jpdb-subtitle-drawer-actions">
                ${renderPanelModeControls('tracks', state.hasTranscriptSurface, language)}
                ${state.hasNavigableLines ? renderPanelNavigationControls(true, language) : ''}
                ${renderPausePanelToggle(state.pausePanelEnabled, language)}
                ${renderPanelCloseButton(language)}
            </div>
        </div>
        <div class="jpdb-subtitle-list-scroll">
            <div class="jpdb-subtitle-track-tools">
                <button type="button" data-action="load">${escapeHtml(uiText(language, 'loadJapaneseSubtitles'))}</button>
                <button type="button" data-action="load-secondary">${escapeHtml(uiText(language, 'loadNativeSubtitles'))}</button>
            </div>
            <div class="jpdb-subtitle-track-summary">${escapeHtml(trackPanelSummaryText(state.autoDetected, language))}</div>
            <div class="jpdb-subtitle-track-hint">${escapeHtml(uiText(language, 'subtitleTracksHint'))}</div>
            ${state.tracks.length ? state.tracks.map(track => renderSubtitleTrackRow(track, state)).join('') : ''}
        </div>
        <div class="jpdb-subtitle-resize" data-resize-transcript role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${escapeHtml(uiText(language, 'resizeSubtitleTracksPanel'))}"></div>
    `;
}

export function subtitleDrawerMetaText(options: {
    mode: 'lines' | 'tracks';
    count: number;
    tracks: SubtitleTrackPanelTrack[];
    selectedTrackId: string;
    secondaryTrackId: string;
    language: InterfaceLanguage;
}): string {
    const primaryTrack = options.tracks.find(track => track.id === options.selectedTrackId);
    const secondaryTrack = options.tracks.find(track => track.id === options.secondaryTrackId);
    const primary = primaryTrack ? localizedSubtitleTrackLabel(primaryTrack, options.language) : undefined;
    const secondary = secondaryTrack ? localizedSubtitleTrackLabel(secondaryTrack, options.language) : undefined;
    return drawerMetaParts(options.mode, options.count, primary, secondary, options.language).filter(Boolean).join(' \u00b7 ');
}

function renderSubtitleTrackRow(track: SubtitleTrackPanelTrack, state: SubtitleTrackPanelRenderState): string {
    const isPrimary = track.id === state.selectedTrackId;
    const isSecondary = track.id === state.secondaryTrackId;
    const language = state.language;
    return `
        <div class="jpdb-subtitle-track-row ${isPrimary || isSecondary ? 'active' : ''}" data-track-id="${escapeHtml(track.id)}">
            <div class="jpdb-subtitle-track-title">
                    <strong>${escapeHtml(localizedSubtitleTrackLabel(track, language))}</strong>
                    <span>${escapeHtml(formatTrackKind(track.kind, language))}</span>
                </div>
            <span>${escapeHtml(trackLanguageLabel(track, language))}${trackRoleText(isPrimary, isSecondary, language)}${trackStatusText(track, language)}</span>
            <div class="jpdb-subtitle-track-actions">
                <button type="button" data-action="primary-track" aria-pressed="${isPrimary}">${escapeHtml(uiText(language, isPrimary ? 'unsetPrimarySubtitles' : 'primarySubtitles'))}</button>
                <button type="button" data-action="secondary-track" aria-pressed="${isSecondary}">${escapeHtml(uiText(language, isSecondary ? 'unsetNativeSubtitles' : 'nativeSubtitles'))}</button>
            </div>
        </div>
    `;
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
