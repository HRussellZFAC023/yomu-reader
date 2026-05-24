import { escapeHtml } from './dom';
import { gmStorageDeleteSync, gmStorageGetSync, gmStorageSetSync } from './storage';
import type { ReaderSettings } from './types';

const STORAGE_KEY = 'jpdb-reader-source-open-state';

export interface DictionarySourceStateDependencies {
    getSettings: () => ReaderSettings;
    onStateChange: () => void;
}

export class DictionarySourceStateController {
    private openOverrides = loadOpenOverrides();

    constructor(private readonly dependencies: DictionarySourceStateDependencies) {}

    clear(): void {
        this.openOverrides.clear();
        gmStorageDeleteSync(STORAGE_KEY);
    }

    isOpen(sourceStateKey: string, initiallyExpanded = this.dependencies.getSettings().dictionarySourcesInitiallyExpanded): boolean {
        return this.openOverrides.get(sourceStateKey) ?? initiallyExpanded;
    }

    attributes(sourceStateKey: string, initiallyExpanded = this.dependencies.getSettings().dictionarySourcesInitiallyExpanded): string {
        const isOpen = this.isOpen(sourceStateKey, initiallyExpanded);
        return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(isOpen)}"${isOpen ? ' open' : ''}`;
    }

    closedAttributes(sourceStateKey: string): string {
        return `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="false"`;
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
        saveOpenOverrides(this.openOverrides);
        this.dependencies.onStateChange();
    }
}

function loadOpenOverrides(): Map<string, boolean> {
    const stored = gmStorageGetSync<Record<string, unknown>>(STORAGE_KEY, {});
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return new Map();
    return new Map(Object.entries(stored).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
}

function saveOpenOverrides(openOverrides: Map<string, boolean>): void {
    gmStorageSetSync(STORAGE_KEY, Object.fromEntries(openOverrides));
}
