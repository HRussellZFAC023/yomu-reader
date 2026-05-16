import type { AudioPlayer } from './audio';
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
            this.dependencies.toast(error instanceof Error ? error.message : 'Audio playback failed.');
        } finally {
            this.clearLoading(loadingPopover, loadingRequest);
        }
    }

    async playSentenceAudio(sentence?: string): Promise<void> {
        const text = sentence?.trim();
        if (!text) throw new Error('No sentence to read aloud.');
        const voice = this.dependencies.getSettings().audioSources.find(source =>
            source.enabled && (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') && source.voice.trim()
        )?.voice.trim() ?? '';
        this.dependencies.stopImmersionAudio();
        await this.dependencies.audio.playJapaneseText(text, voice);
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
