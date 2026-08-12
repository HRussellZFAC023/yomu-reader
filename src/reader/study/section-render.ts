import { escapeHtml } from '../dom';
import { speakerIcon } from '../ui/icons';
import { uiText } from '../app/i18n';
import type { InterfaceLanguage } from '../app/types';
import type { LanguageTag, TextDirection } from '../languages/types';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

export interface StudyTextMetadata {
    lang: LanguageTag;
    dir: TextDirection | 'auto';
}

export interface StudySentenceAudioOptions {
    audioEnabled: boolean;
    sentence?: string;
    attrs?: string;
    content?: StudyTextMetadata;
}

export interface StudyMeaningOptions {
    resultAttrs?: string;
    content?: StudyTextMetadata;
}

function renderStudyBlock(className: string, content: string, attrs = ''): string {
    return `<div class="${studyBlockClassName(className)}"${studyAttrs(attrs)}>${content}</div>`;
}

export function renderStudySentenceBlock(sentence: string, language: InterfaceLanguage, options: StudySentenceAudioOptions): string {
    return renderStudyBlock('jpdb-reader-study-sentence-block', `
        <div class="jpdb-reader-study-label-row jpdb-reader-study-sentence-row">
            <div class="jpdb-reader-study-original jpdb-reader-parseable" data-study-original-render${studyTextAttrs(options.content)}>${escapeHtml(sentence)}</div>
            ${renderStudySentenceAudioButton(language, options)}
        </div>`, options.attrs);
}

export function renderStudyMeaningBlock(text: string, language: InterfaceLanguage, options: StudyMeaningOptions = {}): string {
    return renderStudyBlock('jpdb-reader-study-meaning-block', `
        <div class="jpdb-reader-study-label">${escapeHtml(uiText(language, 'meaning'))}</div>
        <div class="jpdb-reader-study-translation"${studyAttrs(options.resultAttrs)}${studyTextAttrs(options.content)}>${escapeHtml(text)}</div>`);
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
    const capability = privateCommandAttributes({ kind: 'card-action', action: 'study-read-sentence', sentence: options.sentence });
    return `<button class="jpdb-reader-icon-mini" data-action="study-read-sentence"${sentenceAttr}${capability} type="button" title="${escapeHtml(readSentence)}" aria-label="${escapeHtml(readSentence)}"${options.audioEnabled ? '' : ' disabled'}>${speakerIcon()}</button>`;
}

function studyBlockClassName(className: string): string {
    return ['jpdb-reader-study-block', className.trim()].filter(Boolean).join(' ');
}

function studyAttrs(attrs?: string): string {
    const trimmed = attrs?.trim() ?? '';
    return trimmed ? ` ${trimmed}` : '';
}

function studyTextAttrs(content?: StudyTextMetadata): string {
    if (!content) return '';
    return ` lang="${escapeHtml(content.lang)}" dir="${content.dir}"`;
}
