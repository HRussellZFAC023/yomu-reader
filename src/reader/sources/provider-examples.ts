import type { InterfaceLanguage } from '../app/types';
import { uiText } from '../app/i18n';
import { escapeHtml } from '../dom';
import { speakerIcon } from '../ui/icons';

export type ProviderCollection<T> =
    | { availability: 'loaded'; items: T[] }
    | { availability: 'empty'; items: [] }
    | { availability: 'unavailable'; items: []; reason: 'auth' | 'network' | 'schema' };

export interface ProviderExampleAudioView {
    action: string;
    label: string;
    attributes: Record<string, string>;
    className?: string;
}

export interface ProviderExampleView {
    id: string;
    sentenceHtml: string;
    translation: string;
    audio?: ProviderExampleAudioView;
    itemClassName?: string;
    rowClassName?: string;
    textClassName?: string;
    sentenceClassName?: string;
}

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;

export function renderProviderExamples(
    provider: 'bunpro' | 'jiten' | 'jpdb',
    sourceId: string,
    collection: ProviderCollection<ProviderExampleView>,
    sourceAttributes: SourceAttributes,
    language: InterfaceLanguage,
): string {
    const availability = collection.availability;
    const unavailableReason = availability === 'unavailable'
        ? ` data-examples-unavailable-reason="${collection.reason}"`
        : '';
    const count = availability === 'loaded' ? String(collection.items.length) : availability === 'empty' ? '0' : '—';
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group jpdb-reader-jpdb-examples-group" data-example-provider="${provider}" data-examples-availability="${availability}"${unavailableReason} ${sourceAttributes(definitionSourceStateKey(`${sourceId}:examples`))}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(uiText(language, 'exampleSentences'))}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count">${count}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                ${availability === 'loaded'
                    ? `<ul class="jpdb-reader-jpdb-examples">${collection.items.map(renderProviderExample).join('')}</ul>`
                    : `<p class="jpdb-reader-example-availability">${escapeHtml(uiText(language, availability === 'empty' ? 'noExampleSentences' : 'exampleSentencesUnavailable'))}</p>`}
            </div>
        </details>
    `;
}

function definitionSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}`;
}

function renderProviderExample(example: ProviderExampleView): string {
    const hasAudio = Boolean(example.audio);
    return `
        <li class="${classes('jpdb-reader-jpdb-example', example.itemClassName)}" data-provider-example-id="${escapeHtml(example.id)}">
            <div class="${classes('jpdb-reader-jpdb-example-row', example.rowClassName, hasAudio ? 'has-audio' : '')}">
                ${example.audio ? renderProviderExampleAudio(example.audio) : ''}
                <div class="${classes('jpdb-reader-jpdb-example-text', example.textClassName)}">
                    <div class="${classes('jpdb-reader-example-sentence jpdb-reader-parseable', example.sentenceClassName)}" data-provider-example-sentence>${example.sentenceHtml}</div>
                    ${example.translation ? `<div class="jpdb-reader-example-translation">${escapeHtml(example.translation)}</div>` : ''}
                </div>
            </div>
        </li>
    `;
}

function renderProviderExampleAudio(audio: ProviderExampleAudioView): string {
    const attributes = Object.entries(audio.attributes)
        .filter(([name]) => /^data-[a-z0-9-]+$/u.test(name))
        .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
        .join('');
    return `<button class="${classes('jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio', audio.className)}" type="button" data-action="${escapeHtml(audio.action)}"${attributes} title="${escapeHtml(audio.label)}" aria-label="${escapeHtml(audio.label)}">${speakerIcon()}</button>`;
}

function classes(...values: Array<string | undefined>): string {
    return values.map(value => value?.trim() ?? '').filter(Boolean).join(' ');
}
