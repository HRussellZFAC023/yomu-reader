import type { ReaderSettings } from '../app/types';

export function resolvedAnkiDeckName(deckOverride: string | undefined, settings: ReaderSettings): string {
    return deckOverride?.trim() || settings.ankiDeck || 'よむ';
}

export function resolvedAnkiModelName(settings: ReaderSettings): string {
    return settings.ankiModel || 'よむ Japanese';
}
