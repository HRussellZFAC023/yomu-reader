import type { JPDBCard, ReaderSettings } from '../app/types';
import { escapeHtml, setInnerHtml } from '../dom';
import { definitionSourceStateKey, kanjiSourceStateKey } from '../sources/definition-render';
import { KANJI_WANIKANI_SOURCE_ID } from '../sources/sections';
import { WANIKANI_DEFINITION_SOURCE_ID } from '../app/constants';
import { WanikaniLookupClient, type WanikaniLookupInfo } from './wanikani-lookup';
import {
    primaryMeaning,
    type WanikaniAudio,
    type WanikaniAuxiliaryMeaning,
    type WanikaniMeaning,
    type WanikaniReading,
    type WanikaniSubject,
} from './wanikani-subjects';
import { renderWanikaniMarkup } from './wanikani-render';
import { privateCommandAttributes } from '../dom/private-command-capabilities';

type SourceAttributes = (key: string, initiallyExpanded?: boolean) => string;

export function renderWanikaniDefinitionMount(card: JPDBCard, settings: ReaderSettings, sourceAttributes: SourceAttributes): string {
    if (!settings.wanikaniDefinitionsEnabled || !settings.wanikaniApiToken.trim()) return '';
    return `<div data-wanikani-definition-mount data-wanikani-expression="${escapeHtml(card.spelling)}" data-wanikani-reading="${escapeHtml(card.reading)}">
        ${renderLoadingSource(settings.wanikaniDefinitionsAlias || 'WaniKani', sourceAttributes(definitionSourceStateKey(WANIKANI_DEFINITION_SOURCE_ID)))}
    </div>`;
}

export class WanikaniSourceController {
    constructor(
        private readonly lookup: WanikaniLookupClient,
        private readonly getSettings: () => ReaderSettings,
        private readonly sourceAttributes: SourceAttributes,
        private readonly onRendered?: (mount: HTMLElement) => void,
    ) {}

    installDefinitionMounts(root: ParentNode, card: JPDBCard): void {
        for (const mount of root.querySelectorAll<HTMLElement>('[data-wanikani-definition-mount]')) {
            if (mount.dataset.wanikaniLoading === 'true' || mount.dataset.wanikaniLoaded === 'true') continue;
            mount.dataset.wanikaniLoading = 'true';
            void this.lookup.lookupCard(card).then(info => {
                if (!mount.isConnected) return;
                if (!info) {
                    mount.remove();
                    return;
                }
                const settings = this.getSettings();
                setInnerHtml(mount, renderWanikaniSource(
                    info,
                    settings,
                    this.sourceAttributes(definitionSourceStateKey(WANIKANI_DEFINITION_SOURCE_ID)),
                    // fallow-ignore-next-line code-duplication
                    settings.wanikaniDefinitionsAlias || 'WaniKani',
                ));
                mount.dataset.wanikaniLoaded = 'true';
                this.onRendered?.(mount);
            }).catch(() => {
                if (mount.isConnected) mount.remove();
            }).finally(() => delete mount.dataset.wanikaniLoading);
        }
    }

    installKanjiMount(root: ParentNode, kanji: string): void {
        const mount = root.querySelector<HTMLElement>('[data-kanji-wanikani-mount]');
        if (!mount || mount.dataset.wanikaniLoading === 'true' || mount.dataset.wanikaniLoaded === 'true') return;
        const settings = this.getSettings();
        if (!settings.wanikaniKanjiEnabled || !settings.wanikaniApiToken.trim()) {
            mount.remove();
            return;
        }
        mount.dataset.wanikaniLoading = 'true';
        setInnerHtml(mount, renderLoadingSource(settings.wanikaniKanjiAlias || 'WaniKani', this.sourceAttributes(kanjiSourceStateKey(KANJI_WANIKANI_SOURCE_ID))));
        void this.lookup.lookupKanji(kanji).then(info => {
            if (!mount.isConnected) return;
            if (!info || info.subject.type !== 'kanji') {
                mount.remove();
                return;
            }
            setInnerHtml(mount, renderWanikaniSource(
                info,
                settings,
                this.sourceAttributes(kanjiSourceStateKey(KANJI_WANIKANI_SOURCE_ID)),
                // fallow-ignore-next-line code-duplication
                settings.wanikaniKanjiAlias || 'WaniKani',
            ));
            mount.dataset.wanikaniLoaded = 'true';
            this.onRendered?.(mount);
        }).catch(() => {
            if (mount.isConnected) mount.remove();
        }).finally(() => delete mount.dataset.wanikaniLoading);
    }
}

export function renderWanikaniSource(info: WanikaniLookupInfo, settings: ReaderSettings, attributes: string, label = 'WaniKani'): string {
    const subject = info.subject;
    return `<details class="jpdb-reader-local jpdb-reader-source-card yomu-wanikani-source" data-source="wanikani" ${attributes}>
        <summary class="jpdb-reader-local-title">${escapeHtml(label)}</summary>
        <div class="jpdb-reader-local-entry yomu-wanikani-body">
            ${renderWanikaniMeta(info, settings)}
            ${renderWanikaniPublicDefinitions(subject)}
            ${renderWanikaniReadings(subject)}
            ${renderWanikaniSynonyms(info)}
            ${renderWanikaniAudio(subject.audio)}
            ${renderMnemonic('Meaning mnemonic', subject.meaningMnemonic)}
            ${renderMnemonic('Meaning hint', subject.meaningHint)}
            ${renderMnemonic('Reading mnemonic', subject.readingMnemonic)}
            ${renderMnemonic('Reading hint', subject.readingHint)}
            ${renderNote('Your meaning note', info.studyMaterial?.meaningNote)}
            ${renderNote('Your reading note', info.studyMaterial?.readingNote)}
            ${renderSubjectLinks('Components', info.components)}
            ${renderSubjectLinks('Visually similar', info.visuallySimilar)}
            ${renderSubjectLinks('Related vocabulary', info.relatedVocabulary)}
            ${renderWanikaniContextSentences(subject)}
            ${renderWanikaniExternalLink(subject)}
        </div>
    </details>`;
}

function renderWanikaniMeta(info: WanikaniLookupInfo, settings: ReaderSettings): string {
    const parts = [
        `Level ${info.subject.level}`,
        renderWanikaniStage(info),
        renderWanikaniDueDate(info, settings),
        renderWanikaniAccuracy(info),
    ].filter(Boolean);
    return `<div class="jpdb-reader-meta">${parts.join(' · ')}</div>`;
}

function renderWanikaniStage(info: WanikaniLookupInfo): string {
    return info.assignment ? escapeHtml(wanikaniStageLabel(info.assignment.srsStage)) : '';
}

function renderWanikaniDueDate(info: WanikaniLookupInfo, settings: ReaderSettings): string {
    const availableAt = info.assignment?.availableAt;
    if (!availableAt) return '';
    const due = formatDate(availableAt, settings.interfaceLanguage);
    return due ? `due ${escapeHtml(due)}` : '';
}

function renderWanikaniAccuracy(info: WanikaniLookupInfo): string {
    return info.reviewStatistic ? `${info.reviewStatistic.percentageCorrect}% correct` : '';
}

function renderWanikaniPublicDefinitions(subject: WanikaniSubject): string {
    const payload = wanikaniPublicDefinitionPayload(subject);
    return `<div class="yomu-wanikani-public-definitions"${wanikaniDefinitionPayloadAttributes(payload)}>
        <p><strong>Meanings:</strong> ${subject.meanings.map(renderWanikaniMeaning).join(', ')}</p>
        ${renderWanikaniAlternatives('Also accepted', subject.auxiliaryMeanings, 'whitelist')}
        ${renderWanikaniAlternatives('Not accepted', subject.auxiliaryMeanings, 'blacklist')}
    </div>`;
}

function renderWanikaniMeaning(item: WanikaniMeaning): string {
    const primary = item.primary ? ' <strong>primary</strong>' : '';
    const accepted = item.acceptedAsCorrect ? '' : ' <small>not accepted</small>';
    return `${escapeHtml(item.meaning)}${primary}${accepted}`;
}

function renderWanikaniAlternatives(label: string, items: WanikaniAuxiliaryMeaning[], type: WanikaniAuxiliaryMeaning['type']): string {
    const values = items.filter(item => item.type === type).map(item => escapeHtml(item.meaning)).join(', ');
    return renderWanikaniParagraph(label, values);
}

function wanikaniPublicDefinitionPayload(subject: WanikaniSubject): string {
    const publicAlternativeTypes = new Set<WanikaniAuxiliaryMeaning['type']>(['whitelist', 'blacklist']);
    const alternatives = subject.auxiliaryMeanings.filter(item => publicAlternativeTypes.has(item.type));
    return [...subject.meanings, ...alternatives].map(item => item.meaning).filter(Boolean).join('\n');
}

function wanikaniDefinitionPayloadAttributes(payload: string): string {
    return payload ? ` data-definition-translation-text data-definition-translation-payload="${escapeHtml(payload)}"` : '';
}

function renderWanikaniReadings(subject: WanikaniSubject): string {
    return renderWanikaniParagraph('Readings', subject.readings.map(renderWanikaniReading).join(', '));
}

function renderWanikaniReading(item: WanikaniReading): string {
    const type = item.type ? ` <small>${escapeHtml(item.type)}</small>` : '';
    const accepted = item.acceptedAsCorrect ? '' : ' <small>not accepted</small>';
    return `${escapeHtml(item.reading)}${type}${accepted}`;
}

function renderWanikaniSynonyms(info: WanikaniLookupInfo): string {
    const synonyms = info.studyMaterial?.meaningSynonyms.map(escapeHtml).join(', ') ?? '';
    return renderWanikaniParagraph('Your synonyms', synonyms);
}

function renderWanikaniParagraph(label: string, value: string): string {
    return value ? `<p><strong>${escapeHtml(label)}:</strong> ${value}</p>` : '';
}

function renderWanikaniAudio(items: WanikaniAudio[]): string {
    const audio = preferredWanikaniAudio(items).map(renderWanikaniAudioButton).join(' ');
    return audio ? `<div class="yomu-wanikani-audio">${audio}</div>` : '';
}

function renderWanikaniAudioButton(item: WanikaniAudio, index: number): string {
    const ordinal = index + 1;
    const title = item.voiceDescription ? ` title="${escapeHtml(item.voiceDescription)}"` : '';
    const label = item.voiceActorName || `Audio ${ordinal}`;
    return `<button type="button" class="jpdb-reader-action-pill" data-action="wanikani-audio" data-audio-url="${escapeHtml(item.url)}"${privateCommandAttributes({ kind: 'card-action', action: 'wanikani-audio', audioUrl: item.url })} aria-label="Play WaniKani pronunciation ${ordinal}"${title}>▶ ${escapeHtml(label)}</button>`;
}

function renderWanikaniContextSentences(subject: WanikaniSubject): string {
    if (!subject.contextSentences.length) return '';
    const sentences = subject.contextSentences.map(sentence => `<li><span lang="ja">${escapeHtml(sentence.ja)}</span><br>${escapeHtml(sentence.en)}</li>`).join('');
    return `<div><strong>Context sentences</strong><ul>${sentences}</ul></div>`;
}

function renderWanikaniExternalLink(subject: WanikaniSubject): string {
    if (!safeExternalUrl(subject.documentUrl)) return '';
    return `<p><a href="${escapeHtml(subject.documentUrl)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(subject.characters || subject.slug)} on WaniKani</a></p>`;
}

function renderLoadingSource(label: string, attributes: string): string {
    return `<details class="jpdb-reader-local jpdb-reader-source-card yomu-wanikani-source" data-source="wanikani" ${attributes}><summary class="jpdb-reader-local-title">${escapeHtml(label)}</summary><div class="jpdb-reader-local-entry"><div class="jpdb-reader-help">Loading WaniKani…</div></div></details>`;
}

function renderMnemonic(label: string, value?: string): string {
    return value ? `<div class="yomu-wanikani-mnemonic"><strong>${escapeHtml(label)}</strong><p>${renderWanikaniMarkup(value)}</p></div>` : '';
}

function renderNote(label: string, value?: string): string {
    return value ? `<div><strong>${escapeHtml(label)}</strong><p>${escapeHtml(value)}</p></div>` : '';
}

function renderSubjectLinks(label: string, subjects: WanikaniLookupInfo['components']): string {
    if (!subjects.length) return '';
    return `<p><strong>${escapeHtml(label)}:</strong> ${subjects.map(subject => safeExternalUrl(subject.documentUrl)
        ? `<a href="${escapeHtml(subject.documentUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(subject.characters || primaryMeaning(subject) || subject.slug)}</a>`
        : escapeHtml(subject.characters || primaryMeaning(subject) || subject.slug)).join(', ')}</p>`;
}

function wanikaniStageLabel(stage: number): string {
    if (stage <= 0) return 'lesson';
    if (stage <= 4) return `apprentice ${stage}`;
    if (stage <= 6) return `guru ${stage - 4}`;
    return stage === 7 ? 'master' : stage === 8 ? 'enlightened' : 'burned';
}

function formatDate(value: string, language: ReaderSettings['interfaceLanguage']): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(language === 'ja' ? 'ja-JP' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function safeMediaUrl(value: string): boolean {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}

// fallow-ignore-next-line complexity
function preferredWanikaniAudio(items: WanikaniAudio[]): WanikaniAudio[] {
    const preferred = new Map<string, WanikaniAudio>();
    for (const item of items.filter(candidate => safeMediaUrl(candidate.url))) {
        const key = item.sourceId !== undefined
            ? `source:${item.sourceId}`
            : item.voiceActorName || item.pronunciation || item.voiceGender
                ? `voice:${item.voiceActorName ?? ''}:${item.pronunciation ?? ''}:${item.voiceGender ?? ''}`
                : `url:${item.url}`;
        const existing = preferred.get(key);
        if (!existing || audioFormatPreference(item.contentType) > audioFormatPreference(existing.contentType)) {
            preferred.set(key, item);
        }
    }
    return [...preferred.values()];
}

function audioFormatPreference(contentType: string): number {
    if (contentType === 'audio/mpeg') return 3;
    if (contentType === 'audio/webm') return 2;
    if (contentType === 'audio/ogg') return 1;
    return 0;
}

function safeExternalUrl(value: string): boolean {
    try {
        return new URL(value).protocol === 'https:';
    } catch {
        return false;
    }
}
