import type { AudioPlayer } from './player';
import { resolveUiLanguage, uiText } from '../app/i18n';
import { Logger } from '../app/logger';
import type { JPDBCard, ReaderSettings } from '../app/types';

const log = Logger.scope('ReaderAudioActions');

export interface ReaderAudioActionsDependencies {
    audio: AudioPlayer;
    getSettings: () => ReaderSettings;
    getActivePopover: () => HTMLElement | undefined;
    getHoverLookupGeneration: () => number;
    stopImmersionAudio: () => void;
    toast: (message: string) => void;
}

interface TermAudioOptions {
    hoverLookupGeneration?: number;
    userGesture?: boolean;
    isCurrent?: () => boolean;
    autoPlay?: boolean;
}

interface LoadingAudioRequest {
    popover?: HTMLElement;
    requestId: number;
}

export class ReaderAudioActions {
    private loadingRequest = 0;
    private inFlightTermAudio?: { key: string; promise: Promise<boolean> };
    private lastAutoTermAudio?: { key: string; at: number };

    constructor(private readonly dependencies: ReaderAudioActionsDependencies) {}

    async playTermAudio(card: JPDBCard, options: TermAudioOptions = {}): Promise<void> {
        if (!this.ensureAudioEnabled()) return;
        const isCurrent = this.termAudioCurrentGuard(options);
        if (this.isStaleTermAudioRequest(isCurrent)) return;

        const key = termAudioRequestKey(card, options);
        const inFlight = this.inFlightTermAudio;
        if (this.shouldJoinInFlightTermAudio(inFlight, key, options)) {
            await inFlight.promise;
            return;
        }
        const autoKey = options.autoPlay ? termAudioAutoRequestKey(card) : key;
        if (options.autoPlay && this.consumeRecentAutoTermAudio(autoKey)) return;

        const promise = this.playTermAudioOnce(card, { ...options, isCurrent });
        this.inFlightTermAudio = { key, promise };
        try {
            const played = await promise;
            if (options.autoPlay && played) this.lastAutoTermAudio = { key: autoKey, at: Date.now() };
        } finally {
            if (this.inFlightTermAudio?.promise === promise) this.inFlightTermAudio = undefined;
        }
    }

    private shouldJoinInFlightTermAudio(
        inFlight: { key: string; promise: Promise<boolean> } | undefined,
        key: string,
        options: { autoPlay?: boolean },
    ): inFlight is { key: string; promise: Promise<boolean> } {
        return Boolean(options.autoPlay && inFlight?.key === key);
    }

    private async playTermAudioOnce(card: JPDBCard, options: TermAudioOptions = {}): Promise<boolean> {
        const isCurrent = this.termAudioCurrentGuard(options);
        const loading = this.beginLoadingAudioRequest(isCurrent);
        if (!loading) return false;
        try {
            this.dependencies.stopImmersionAudio();
            const played = await this.dependencies.audio.play(card, { isCurrent, userGesture: options.userGesture });
            return played;
        } catch (error) {
            log.warn('Term audio playback failed', { term: card.spelling }, error);
            this.dependencies.toast(this.audioErrorMessage(error));
            return false;
        } finally {
            this.clearLoading(loading.popover, loading.requestId);
        }
    }

    private termAudioCurrentGuard(options: TermAudioOptions): (() => boolean) | undefined {
        return options.isCurrent ?? (options.hoverLookupGeneration === undefined
            ? undefined
            : () => this.dependencies.getHoverLookupGeneration() === options.hoverLookupGeneration);
    }

    private isStaleTermAudioRequest(isCurrent: (() => boolean) | undefined): boolean {
        return Boolean(isCurrent && !isCurrent());
    }

    private beginLoadingAudioRequest(isCurrent: (() => boolean) | undefined): LoadingAudioRequest | null {
        if (this.isStaleTermAudioRequest(isCurrent)) return null;
        const requestId = ++this.loadingRequest;
        const popover = this.dependencies.getActivePopover();
        this.setLoading(popover, requestId);
        return { popover, requestId };
    }

    private consumeRecentAutoTermAudio(key: string): boolean {
        const recent = this.lastAutoTermAudio;
        if (!recent || recent.key !== key) return false;
        if (Date.now() - recent.at > 250) return false;
        this.lastAutoTermAudio = { key, at: Date.now() };
        return true;
    }

    async playSentenceAudio(sentence?: string): Promise<void> {
        if (!this.ensureAudioEnabled()) return;
        const text = sentence?.trim();
        if (!text) throw new Error(uiText(this.dependencies.getSettings().interfaceLanguage, 'noSentenceToRead'));
        const voice = this.dependencies.getSettings().audioSources.find(source =>
            source.enabled && (source.type === 'text-to-speech' || source.type === 'text-to-speech-reading') && source.voice.trim()
        )?.voice.trim() ?? '';
        this.dependencies.stopImmersionAudio();
        await this.dependencies.audio.playJapaneseText(text, voice);
    }

    async playJpdbExampleAudio(audioIds: string | string[], fallbackSentence?: string): Promise<void> {
        if (!this.ensureAudioEnabled()) return;
        this.dependencies.stopImmersionAudio();
        const played = await this.dependencies.audio.playJpdbAudio(audioIds, { userGesture: true });
        if (!played && fallbackSentence) await this.playSentenceAudio(fallbackSentence);
    }

    async playMediaUrl(audioUrl: string): Promise<boolean> {
        if (!this.ensureAudioEnabled()) return false;
        this.dependencies.stopImmersionAudio();
        return await this.dependencies.audio.playMediaUrl(audioUrl);
    }

    private ensureAudioEnabled(): boolean {
        const settings = this.dependencies.getSettings();
        if (settings.audioEnabled) return true;
        this.dependencies.toast(uiText(settings.interfaceLanguage, 'audioPlaybackDisabledToast'));
        return false;
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

function termAudioRequestKey(card: JPDBCard, options: { hoverLookupGeneration?: number; userGesture?: boolean }): string {
    return [
        card.source ?? '',
        String(card.vid ?? ''),
        String(card.sid ?? ''),
        String(card.rid ?? ''),
        card.spelling,
        card.reading,
        options.userGesture ? 'gesture' : 'auto',
        options.hoverLookupGeneration === undefined ? '' : String(options.hoverLookupGeneration),
    ].join('\u0000');
}

function termAudioAutoRequestKey(card: JPDBCard): string {
    return [
        card.source ?? '',
        String(card.vid ?? ''),
        String(card.sid ?? ''),
        String(card.rid ?? ''),
        card.spelling,
        card.reading,
    ].join('\u0000');
}
