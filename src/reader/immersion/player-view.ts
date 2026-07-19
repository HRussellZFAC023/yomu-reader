import { uiText } from '../app/i18n';
import { escapeHtml, setInnerHtml } from '../dom/index';
import { el } from '../dom/builder';
import { speakerIcon } from '../ui/icons';
import { localizedImmersionProviderLabel, localizedImmersionSourceTitle } from './labels';
import type { InterfaceLanguage } from '../app/types';
import type { ImmersionKitExample } from './kit';

export type ImmersionPlayerAction = 'previous' | 'audio' | 'next';

export function nextImmersionExampleIndex(index: number, total: number, action: ImmersionPlayerAction): number {
    if (!Number.isFinite(index) || total <= 0) return 0;
    const delta = action === 'next' ? 1 : action === 'previous' ? -1 : 0;
    return (index + delta + total) % total;
}

export function validImmersionExampleIndex(index: number, total: number): number {
    return Number.isFinite(index) && index >= 0 && index < total ? index : 0;
}

export function renderImmersionExampleActionsHtml(hasAudio: boolean, language: InterfaceLanguage): string {
    const previous = uiText(language, 'previousExample');
    const next = uiText(language, 'nextExample');
    const audio = uiText(language, 'playExampleAudio');
    return `
        <div class="jpdb-reader-example-actions" role="group" aria-label="${escapeHtml(uiText(language, 'immersionExampleControls'))}">
            ${renderImmersionActionButtonHtml('previous', previous, '‹')}
            ${hasAudio ? renderImmersionActionButtonHtml('audio', audio, speakerIcon()) : ''}
            ${renderImmersionActionButtonHtml('next', next, '›')}
        </div>
    `;
}

export function renderImmersionExampleToolbar(options: {
    example: ImmersionKitExample;
    index: number;
    total: number;
    hasAudio: boolean;
    language: InterfaceLanguage;
    showSource?: boolean;
}): HTMLElement {
    const { example, index, total, hasAudio, language, showSource } = options;
    const metaAttributes: Record<string, string> = { class: 'jpdb-reader-example-meta' };
    if (!showSource) metaAttributes.title = localizedImmersionProviderLabel(example, language);
    return el('div', { class: 'jpdb-reader-example-toolbar' },
        el('div', metaAttributes,
            showSource ? el('span', { class: 'jpdb-reader-example-source' }, localizedImmersionProviderLabel(example, language)) : null,
            el('span', { class: 'jpdb-reader-example-title' }, localizedImmersionSourceTitle(example.sourceTitle, language)),
            el('span', { class: 'jpdb-reader-example-count' }, `${index + 1}/${total}`),
        ),
        renderImmersionExampleActions(hasAudio, language),
    );
}

function renderImmersionExampleActions(hasAudio: boolean, language: InterfaceLanguage): HTMLElement {
    return el('div', { class: 'jpdb-reader-example-actions', role: 'group', 'aria-label': uiText(language, 'immersionExampleControls') },
        renderImmersionActionButton('previous', uiText(language, 'previousExample'), '‹'),
        hasAudio ? renderImmersionActionButton('audio', uiText(language, 'playExampleAudio'), speakerIcon()) : null,
        renderImmersionActionButton('next', uiText(language, 'nextExample'), '›'),
    );
}

function renderImmersionActionButton(action: ImmersionPlayerAction, label: string, content: string): HTMLButtonElement {
    const button = el('button', {
        class: 'jpdb-reader-icon-mini',
        type: 'button',
        dataset: { immersionAction: action },
        title: label,
        'aria-label': label,
    });
    setInnerHtml(button, content);
    return button;
}

function renderImmersionActionButtonHtml(action: ImmersionPlayerAction, label: string, content: string): string {
    return `<button class="jpdb-reader-icon-mini" type="button" data-immersion-action="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${content}</button>`;
}
