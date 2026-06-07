import { escapeHtml } from '../dom/index';

export function sourceStateAttribute(sourceStateKey: string | undefined, initiallyExpanded: boolean): string {
    return sourceStateKey ? `data-source-state-key="${escapeHtml(sourceStateKey)}" data-source-initial-open="${String(initiallyExpanded)}"` : '';
}
