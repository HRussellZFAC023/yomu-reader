import type { JPDBCard, ReaderSettings } from '../app/types';
import { escapeHtml, setInnerHtml } from '../dom';
import { definitionSourceStateKey, kanjiSourceStateKey } from '../sources/definition-render';
import { KANJI_WANIKANI_SOURCE_ID } from '../sources/sections';
import { WANIKANI_DEFINITION_SOURCE_ID } from '../app/constants';
import { WanikaniLookupClient, type WanikaniLookupInfo } from './wanikani-lookup';
import { primaryMeaning, type WanikaniAudio } from './wanikani-subjects';
import { renderWanikaniMarkup } from './wanikani-render';

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
        private readonly onRendered?: () => void,
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
                    settings.wanikaniDefinitionsAlias || 'WaniKani',
                ));
                mount.dataset.wanikaniLoaded = 'true';
                this.onRendered?.();
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
                settings.wanikaniKanjiAlias || 'WaniKani',
            ));
            mount.dataset.wanikaniLoaded = 'true';
            this.onRendered?.();
        }).catch(() => {
            if (mount.isConnected) mount.remove();
        }).finally(() => delete mount.dataset.wanikaniLoading);
    }
}

export function renderWanikaniSource(info: WanikaniLookupInfo, settings: ReaderSettings, attributes: string, label = 'WaniKani'): string {
    const subject = info.subject;
    const meanings = subject.meanings.map(item => `${escapeHtml(item.meaning)}${item.primary ? ' <strong>primary</strong>' : ''}${item.acceptedAsCorrect ? '' : ' <small>not accepted</small>'}`).join(', ');
    const readings = subject.readings.map(item => `${escapeHtml(item.reading)}${item.type ? ` <small>${escapeHtml(item.type)}</small>` : ''}${item.acceptedAsCorrect ? '' : ' <small>not accepted</small>'}`).join(', ');
    const acceptedAlternatives = subject.auxiliaryMeanings.filter(item => item.type === 'whitelist').map(item => escapeHtml(item.meaning)).join(', ');
    const blockedAlternatives = subject.auxiliaryMeanings.filter(item => item.type === 'blacklist').map(item => escapeHtml(item.meaning)).join(', ');
    const synonyms = info.studyMaterial?.meaningSynonyms.map(escapeHtml).join(', ') ?? '';
    const stage = info.assignment ? wanikaniStageLabel(info.assignment.srsStage) : '';
    const due = info.assignment?.availableAt ? formatDate(info.assignment.availableAt, settings.interfaceLanguage) : '';
    const components = renderSubjectLinks('Components', info.components);
    const similar = renderSubjectLinks('Visually similar', info.visuallySimilar);
    const related = renderSubjectLinks('Related vocabulary', info.relatedVocabulary);
    const sentences = subject.contextSentences.map(sentence => `<li><span lang="ja">${escapeHtml(sentence.ja)}</span><br>${escapeHtml(sentence.en)}</li>`).join('');
    const audio = preferredWanikaniAudio(subject.audio).map((item, index) => `<button type="button" class="jpdb-reader-action-pill" data-action="wanikani-audio" data-audio-url="${escapeHtml(item.url)}" aria-label="Play WaniKani pronunciation ${index + 1}"${item.voiceDescription ? ` title="${escapeHtml(item.voiceDescription)}"` : ''}>▶ ${escapeHtml(item.voiceActorName || `Audio ${index + 1}`)}</button>`).join(' ');
    return `<details class="jpdb-reader-local jpdb-reader-source-card yomu-wanikani-source" data-source="wanikani" ${attributes}>
        <summary class="jpdb-reader-local-title">${escapeHtml(label)}</summary>
        <div class="jpdb-reader-local-entry yomu-wanikani-body">
            <div class="jpdb-reader-meta">Level ${subject.level}${stage ? ` · ${escapeHtml(stage)}` : ''}${due ? ` · due ${escapeHtml(due)}` : ''}${info.reviewStatistic ? ` · ${info.reviewStatistic.percentageCorrect}% correct` : ''}</div>
            <p><strong>Meanings:</strong> ${meanings}</p>
            ${acceptedAlternatives ? `<p><strong>Also accepted:</strong> ${acceptedAlternatives}</p>` : ''}
            ${blockedAlternatives ? `<p><strong>Not accepted:</strong> ${blockedAlternatives}</p>` : ''}
            ${readings ? `<p><strong>Readings:</strong> ${readings}</p>` : ''}
            ${synonyms ? `<p><strong>Your synonyms:</strong> ${synonyms}</p>` : ''}
            ${audio ? `<div class="yomu-wanikani-audio">${audio}</div>` : ''}
            ${renderMnemonic('Meaning mnemonic', subject.meaningMnemonic)}
            ${renderMnemonic('Meaning hint', subject.meaningHint)}
            ${renderMnemonic('Reading mnemonic', subject.readingMnemonic)}
            ${renderMnemonic('Reading hint', subject.readingHint)}
            ${renderNote('Your meaning note', info.studyMaterial?.meaningNote)}
            ${renderNote('Your reading note', info.studyMaterial?.readingNote)}
            ${components}${similar}${related}
            ${sentences ? `<div><strong>Context sentences</strong><ul>${sentences}</ul></div>` : ''}
            ${safeExternalUrl(subject.documentUrl) ? `<p><a href="${escapeHtml(subject.documentUrl)}" target="_blank" rel="noopener noreferrer">Open ${escapeHtml(subject.characters || subject.slug)} on WaniKani</a></p>` : ''}
        </div>
    </details>`;
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
