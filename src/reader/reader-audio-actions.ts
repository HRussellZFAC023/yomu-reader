import type { AudioPlayer } from './audio';
import { resolveUiLanguage, uiText } from './i18n';
import { Logger } from './logger';
import type { JPDBCard, ReaderSettings } from './types';

const log = Logger.scope('ReaderAudioActions');

export interface ReaderAudioActionsDependencies {
    audio: AudioPlayer;
    getSettings: () => ReaderSettings;
    getActivePopover: () => HTMLElement | undefined;
    getHoverLookupGeneration: () => number;
    stopImmersionAudio: () => void;
    toast: (message: string) => void;
}

export class ReaderAudioActions {
    private loadingRequest = 0;

    constructor(private readonly dependencies: ReaderAudioActionsDependencies) {}

    async playTermAudio(card: JPDBCard, options: { hoverLookupGeneration?: number; userGesture?: boolean } = {}): Promise<void> {
        if (!this.dependencies.getSettings().audioEnabled) {
            this.dependencies.toast(uiText(this.dependencies.getSettings().interfaceLanguage, 'audioPlaybackDisabledToast'));
            return;
        }
        const isCurrent = options.hoverLookupGeneration === undefined
            ? undefined
            : () => this.dependencies.getHoverLookupGeneration() === options.hoverLookupGeneration;
        const loadingPopover = this.dependencies.getActivePopover();
        const loadingRequest = ++this.loadingRequest;
        this.setLoading(loadingPopover, loadingRequest);
        try {
            this.dependencies.stopImmersionAudio();
            const played = await this.dependencies.audio.play(card, { isCurrent, userGesture: options.userGesture });
            if (!played) return;
        } catch (error) {
            log.warn('Term audio playback failed', { term: card.spelling }, error);
            this.dependencies.toast(this.audioErrorMessage(error));
        } finally {
            this.clearLoading(loadingPopover, loadingRequest);
        }
    }

    async playSentenceAudio(sentence?: string): Promise<void> {
        const text = sentence?.trim();
        if (!text) throw new Error(uiText(this.dependencies.getSettings().interfaceLanguage, 'noSentenceToRead'));
        const voice = this.dependencies.getSettings().audioSources.find(source =>
            source.enabled && (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') && source.voice.trim()
        )?.voice.trim() ?? '';
        this.dependencies.stopImmersionAudio();
        await this.dependencies.audio.playJapaneseText(text, voice);
    }

    async playJpdbExampleAudio(audioIds: string | string[], fallbackSentence?: string): Promise<void> {
        if (!this.dependencies.getSettings().audioEnabled) {
            this.dependencies.toast(uiText(this.dependencies.getSettings().interfaceLanguage, 'audioPlaybackDisabledToast'));
            return;
        }
        this.dependencies.stopImmersionAudio();
        const played = await this.dependencies.audio.playJpdbAudio(audioIds, { userGesture: true });
        if (!played && fallbackSentence) await this.playSentenceAudio(fallbackSentence);
    }

    async playMediaUrl(audioUrl: string): Promise<void> {
        if (!this.dependencies.getSettings().audioEnabled) {
            this.dependencies.toast(uiText(this.dependencies.getSettings().interfaceLanguage, 'audioPlaybackDisabledToast'));
            return;
        }
        this.dependencies.stopImmersionAudio();
        await this.dependencies.audio.playMediaUrl(audioUrl);
    }

    private audioErrorMessage(error: unknown): string {
        const language = this.dependencies.getSettings().interfaceLanguage;
        if (resolveUiLanguage(language) === 'ja') return uiText(language, 'audioPlaybackFailed');
        return error instanceof Error ? error.message : uiText(language, 'audioPlaybackFailed');
    }

    private setLoading(popover: HTMLElement | undefined, requestId: number): void {
        if (!popover?.isConnected) return;
        popover.dataset.audioLoading = 'true';
        popover.dataset.audioLoadingRequest = String(requestId);
    }

    private clearLoading(popover: HTMLElement | undefined, requestId: number): void {
        if (!popover?.isConnected || popover.dataset.audioLoadingRequest !== String(requestId)) return;
        delete popover.dataset.audioLoading;
        delete popover.dataset.audioLoadingRequest;
    }
}
