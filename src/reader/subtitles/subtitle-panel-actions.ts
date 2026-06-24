import { setInnerHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import { compareSubtitleTrackOptions } from './subtitle-track-metadata';
import type { SubtitleTrackOption } from './subtitle-track-options';
import { subtitleIcon, transcriptPlacementIcon } from './subtitle-surface';

export interface SubtitleTrackPanelState {
    tracks: SubtitleTrackOption[];
    autoDetected: number;
}

export function hasSelectedSubtitleTrackOrLines(selectedTrackId: string, hasLines: boolean): boolean {
    return Boolean(selectedTrackId || hasLines);
}

export function subtitleTrackPanelState(tracks: SubtitleTrackOption[]): SubtitleTrackPanelState {
    const sortedTracks = [...tracks].sort(compareSubtitleTrackOptions);
    return {
        tracks: sortedTracks,
        autoDetected: sortedTracks.filter(isAutoDetectedSubtitleTrack).length,
    };
}

export function syncSubtitleTrackStatus(status: HTMLElement, trackCount: number, language: InterfaceLanguage): void {
    status.textContent = subtitleTrackStatusText(trackCount, language);
}

export function syncSubtitleLineNavigationButton(
    button: HTMLButtonElement,
    action: 'previous' | 'next',
    hasLines: boolean,
    hasVideo: boolean,
    hiddenByPanel: boolean,
    language: InterfaceLanguage,
): void {
    button.hidden = !hasLines || hiddenByPanel;
    button.disabled = !hasVideo || !hasLines;
    const label = uiText(language, action === 'previous' ? 'previousSubtitle' : 'nextSubtitle');
    button.title = label;
    button.setAttribute('aria-label', label);
}

export function syncSubtitlePlaybackButton(
    button: HTMLButtonElement,
    options: {
        video: HTMLVideoElement | undefined;
        hiddenByNavigation: boolean;
        hasLines: boolean;
        language: InterfaceLanguage;
    },
): void {
    const paused = options.video?.paused ?? true;
    const label = uiText(options.language, paused ? 'playVideo' : 'pauseVideo');
    button.hidden = !options.hasLines || options.hiddenByNavigation;
    button.disabled = !options.video;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(!paused));
    setInnerHtml(button, subtitleIcon(paused ? 'play' : 'pause'));
}

export function subtitleDrawerButtonState(options: {
    panelOpen: boolean;
    hasLines: boolean;
    hasTranscriptSurface: boolean;
    hasVideo: boolean;
    trackCount: number;
}): { panelOpen: boolean; disabled: boolean } {
    const canOpenTranscript = options.hasLines || options.hasTranscriptSurface;
    const canOpenTracks = options.hasVideo || options.trackCount > 0;
    return {
        panelOpen: options.panelOpen,
        disabled: !canOpenTranscript && !canOpenTracks,
    };
}

export function syncSubtitleDrawerButton(
    button: HTMLButtonElement,
    options: {
        disabled: boolean;
        pressed: boolean;
        placement: ReaderSettings['subtitleTranscriptPlacement'];
        language: InterfaceLanguage;
    },
): void {
    button.hidden = false;
    button.disabled = options.disabled;
    button.title = uiText(options.language, options.pressed ? 'closeSubtitlePanel' : 'openSubtitlePanel');
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(options.pressed));
    setInnerHtml(button, subtitleIcon(transcriptPlacementIcon(options.placement)));
}

export function syncTranscriptPlacementButtons(
    panel: HTMLElement | null,
    placement: ReaderSettings['subtitleTranscriptPlacement'],
    language: InterfaceLanguage,
): void {
    if (!panel || panel.hidden) return;
    const groupLabel = uiText(language, 'subtitleTranscriptPlacement');
    for (const button of Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-action="transcript-placement"][data-placement]'))) {
        const buttonPlacement = button.dataset.placement;
        const pressed = buttonPlacement === placement;
        button.setAttribute('aria-pressed', String(pressed));
        if (buttonPlacement === 'left' || buttonPlacement === 'right' || buttonPlacement === 'bottom') {
            const label = `${groupLabel}: ${uiText(language, buttonPlacement)}`;
            button.title = label;
            button.setAttribute('aria-label', label);
        }
    }
}

function isAutoDetectedSubtitleTrack(track: SubtitleTrackOption): boolean {
    return track.kind === 'youtube' || track.kind === 'native' || track.kind === 'remote';
}

function subtitleTrackStatusText(trackCount: number, language: InterfaceLanguage): string {
    if (trackCount === 0) return uiText(language, 'noSubtitleTracksDetected');
    if (trackCount === 1) return uiText(language, 'subtitleTrackDetectedSingular');
    return `${trackCount} ${uiText(language, 'subtitleTracksDetected')}`;
}
