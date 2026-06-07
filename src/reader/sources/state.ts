import { escapeHtml } from '../dom';
import { installDictionarySourceTracking } from './state-events';
import { gmStorageDeleteSync, gmStorageGetSync, gmStorageSetSync } from '../app/storage';
import type { ReaderSettings } from '../app/types';

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

    installTracking(popover: HTMLElement): void {
        installDictionarySourceTracking(popover, details => this.remember(details));
    }

    private remember(details: HTMLDetailsElement): void {
        const sourceStateKey = details.dataset.sourceStateKey;
        if (!sourceStateKey) return;
        const persistedOpen = this.openOverrides.get(sourceStateKey) ?? (details.dataset.sourceInitialOpen === 'true');
        if (persistedOpen === details.open) return;
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
