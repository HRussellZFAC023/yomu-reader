import { escapeHtml } from './dom';
import { speakerIcon } from './icons';
import { uiText } from './i18n';
import type { InterfaceLanguage } from './types';

export interface StudySentenceAudioOptions {
    audioEnabled: boolean;
    sentence?: string;
}

function renderStudyBlock(className: string, content: string, attrs = ''): string {
    return `<div class="${studyBlockClassName(className)}"${studyAttrs(attrs)}>${content}</div>`;
}

export function renderStudySentenceBlock(sentence: string, language: InterfaceLanguage, options: StudySentenceAudioOptions, attrs = ''): string {
    return renderStudyBlock('jpdb-reader-study-sentence-block', `
        <div class="jpdb-reader-study-label-row jpdb-reader-study-sentence-row">
            <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render>${escapeHtml(sentence)}</div>
            ${renderStudySentenceAudioButton(language, options)}
        </div>`, attrs);
}

export function renderStudyMeaningBlock(text: string, language: InterfaceLanguage, resultAttrs = ''): string {
    return renderStudyBlock('jpdb-reader-study-meaning-block', `
        <div class="jpdb-reader-study-label">${escapeHtml(uiText(language, 'meaning'))}</div>
        <div class="jpdb-reader-study-translation"${studyAttrs(resultAttrs)}>${escapeHtml(text)}</div>`);
}

export function renderStudyEmpty(text: string): string {
    return `<div class="jpdb-reader-study-empty">${escapeHtml(text)}</div>`;
}

export function renderStudyList(items: string[], attrs = ''): string {
    return `<ol class="jpdb-reader-study-list"${studyAttrs(attrs)}>
        ${items.join('')}
        </ol>`;
}

export function renderStudySentenceAudioButton(language: InterfaceLanguage, options: StudySentenceAudioOptions): string {
    const readSentence = uiText(language, options.audioEnabled ? 'readSentenceAloud' : 'audioPlaybackDisabled');
    const sentenceAttr = options.sentence ? ` data-study-sentence="${escapeHtml(options.sentence)}"` : '';
    return `<button class="jpdb-reader-icon-mini" data-action="study-read-sentence"${sentenceAttr} type="button" title="${escapeHtml(readSentence)}" aria-label="${escapeHtml(readSentence)}"${options.audioEnabled ? '' : ' disabled'}>${speakerIcon()}</button>`;
}

function studyBlockClassName(className: string): string {
    return ['jpdb-reader-study-block', className.trim()].filter(Boolean).join(' ');
}

function studyAttrs(attrs: string): string {
    const trimmed = attrs.trim();
    return trimmed ? ` ${trimmed}` : '';
}
