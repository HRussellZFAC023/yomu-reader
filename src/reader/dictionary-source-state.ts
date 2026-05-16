import { escapeHtml } from './dom';
import type { ReaderSettings } from './types';

export interface DictionarySourceStateDependencies {
    getSettings: () => ReaderSettings;
    onStateChange: () => void;
}

export class DictionarySourceStateController {
    private openOverrides = new Map<string, boolean>();

    constructor(private readonly dependencies: DictionarySourceStateDependencies) {}

    clear(): void {
        this.openOverrides.clear();
    }

    isOpen(sourceStateKey: string, initiallyExpanded = this.dependencies.getSettings().dictionarySourcesInitiallyExpanded): boolean {
        return this.openOverrides.get(sourceStateKey) ?? initiallyExpanded;
    }

    attributes(sourceStateKey: string, initiallyExpanded = this.dependencies.getSettings().dictionarySourcesInitiallyExpanded): string {
        const isOpen = this.isOpen(sourceStateKey, initiallyExpanded);
        return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(isOpen)}"${isOpen ? ' open' : ''}`;
    }

    installTracking(popover: HTMLElement): void {
        if (popover.dataset.jpdbReaderSourceTrackingInstalled === 'true') return;
        popover.dataset.jpdbReaderSourceTrackingInstalled = 'true';

        popover.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            const summary = target?.closest<HTMLElement>('summary.jpdb-reader-local-title');
            const details = summary?.parentElement instanceof HTMLDetailsElement ? summary.parentElement : null;
            if (!summary || !details || !popover.contains(summary) || !details.dataset.sourceStateKey) return;
            if (details.dataset.immersionEmpty !== 'true') return;
            event.preventDefault();
            event.stopPropagation();
        });
        popover.addEventListener('toggle', event => {
            const details = event.target instanceof HTMLDetailsElement ? event.target : null;
            if (!details?.dataset.sourceStateKey) return;
            if (details.dataset.immersionEmpty === 'true') {
                if (details.open) details.open = false;
                return;
            }
            this.remember(details);
        }, true);
    }

    private remember(details: HTMLDetailsElement): void {
        const sourceStateKey = details.dataset.sourceStateKey;
        if (!sourceStateKey) return;
        const rememberedOpen = this.openOverrides.get(sourceStateKey);
        if (rememberedOpen === details.open) return;
        const initialOpen = details.dataset.sourceInitialOpen === 'true';
        if (rememberedOpen === undefined && details.open === initialOpen) return;
        this.openOverrides.set(sourceStateKey, details.open);
        this.dependencies.onStateChange();
    }
}
