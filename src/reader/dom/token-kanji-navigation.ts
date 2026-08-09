export interface KanjiNavigationRenderOptions {
    enabled: boolean;
    label: string;
}

export function kanjiNavigationForElement(element: HTMLElement): KanjiNavigationRenderOptions | undefined {
    const host = element.closest<HTMLElement>('[data-jpdb-reader-kanji-nav]');
    if (!host) return undefined;
    return {
        enabled: true,
        label: host.dataset.jpdbReaderKanjiNavLabel || 'Show kanji',
    };
}
