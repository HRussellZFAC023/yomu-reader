import { yomuLocalDictionaries } from '../../companions/registry';
import { escapeHtml } from '../../dom/html';
import { glossaryValueToText } from './glossary-text';

export interface GlossaryRenderOptions {
    internalSearchLinks?: boolean;
}

export function renderStructuredGlossaryHtml(
    value: unknown,
    dictionary = '',
    options: GlossaryRenderOptions = {},
): string {
    const render = yomuLocalDictionaries()?.renderStructuredGlossaryHtml;
    return render
        ? render(value, dictionary, options)
        : escapeHtml(glossaryValueToText(value));
}
