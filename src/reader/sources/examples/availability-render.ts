import { escapeHtml } from '../../dom/index';
import { formatUiText, resolveUiLanguage, uiText } from '../../app/i18n';
import { speakerIcon } from '../../ui/icons';
import type { InterfaceLanguage } from '../../app/types';
import type {
    ExampleAvailabilityReason,
    ExampleCollection,
    ExampleRecord,
    ExampleSourceCapabilities,
} from './types';

/**
 * U46's visible degradation.
 *
 * Before this file, `renderProviderExamples` returned the empty string for any
 * collection that was not `loaded` with at least one item, with a comment
 * arguing that a section with nothing to show does not earn a header. For one
 * Japanese source with dense coverage that was defensible. Across 33 targets it
 * is the A11 defect class: a language with no sentences, a source that does not
 * cover the language, media nobody may ship, and a failed request all collapse
 * into the same nothing, and the learner is left deciding whether Yomu is
 * broken.
 *
 * Every state below stays in the DOM, carries `data-availability`, and says in
 * the INTERFACE language what happened.
 */

type SourceAttributes = (sourceStateKey: string, initiallyExpanded?: boolean) => string;

export interface ExampleSourceRowOptions {
    readonly sourceId: string;
    readonly sourceName: string;
    /** INTERFACE: every label and reason on this row. */
    readonly interfaceLanguage: InterfaceLanguage;
    /** TARGET: what the learner is reading, named in the unsupported reason. */
    readonly targetLanguage: string;
    /** OUTPUT: what a missing translation is missing *in*. */
    readonly outputLanguage: string;
    readonly capabilities: ExampleSourceCapabilities;
    readonly collection: ExampleCollection<ExampleRecord>;
    readonly sourceAttributes: SourceAttributes;
    readonly blurTranslations?: boolean;
}

export function exampleSourceStateKey(sourceId: string): string {
    return `definition-source:${sourceId}:examples`;
}

export function renderExampleSourceRow(options: ExampleSourceRowOptions): string {
    const { collection, capabilities } = options;
    const availability = collection.availability;
    const status = statusChip(options);
    const components = componentAttribute(capabilities);
    const open = availability === 'loaded';
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card jpdb-reader-example-source-card"
            data-example-source="${escapeHtml(options.sourceId)}"
            data-availability="${availability}"
            data-example-components="${escapeHtml(components)}"
            data-example-target="${escapeHtml(options.targetLanguage)}"
            ${options.sourceAttributes(exampleSourceStateKey(options.sourceId), open)}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary" data-jpdb-reader-surface-ignore>
                <span class="jpdb-reader-example-source">${escapeHtml(options.sourceName)}</span>
                <span class="jpdb-reader-source-status jpdb-reader-example-count" data-example-status>${escapeHtml(status)}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                ${renderRowBody(options)}
            </div>
        </details>
    `;
}

function renderRowBody(options: ExampleSourceRowOptions): string {
    const { collection } = options;
    switch (collection.availability) {
        case 'unsupported':
            return reasonBlock(options, 'unsupported-target');
        case 'empty':
            return [
                reasonBlock(options, 'no-results'),
                options.capabilities.corpus === 'limited' ? reasonBlock(options, 'limited-corpus') : '',
            ].join('');
        case 'unavailable':
            return `${reasonBlock(options, collection.reason)}
                <button class="jpdb-reader-btn" type="button" data-action="retry-example-source" data-example-source-id="${escapeHtml(options.sourceId)}">${escapeHtml(uiText(options.interfaceLanguage, 'exampleSourceRetry'))}</button>`;
        case 'loaded':
            return `
                <ul class="jpdb-reader-jpdb-examples">${collection.items.map(record => renderExampleRecord(record, options)).join('')}</ul>
                ${mediaNotices(options, collection)}
            `;
    }
}

/**
 * The status chip. It never says "0": a count of zero next to a source name
 * reads as a bug, where "No examples for this word yet" reads as an answer.
 */
function statusChip(options: ExampleSourceRowOptions): string {
    const { collection, interfaceLanguage } = options;
    switch (collection.availability) {
        case 'loaded':
            return String(collection.items.length);
        case 'empty':
            return uiText(interfaceLanguage, 'exampleSourceEmptyShort');
        case 'unsupported':
            return uiText(interfaceLanguage, 'exampleSourceUnsupportedShort');
        case 'unavailable':
            return uiText(interfaceLanguage, 'exampleSourceFailedShort');
    }
}

/**
 * What the licence gate and the supply matrix withheld from a result that did
 * arrive. This is the "examples found but no licensed audio" state, and it is
 * why audio capability is `per-item` rather than a language-level Boolean.
 */
function mediaNotices(
    options: ExampleSourceRowOptions,
    collection: Extract<ExampleCollection<ExampleRecord>, { availability: 'loaded' }>,
): string {
    const notices: string[] = [];
    const audio = options.capabilities.audio;
    const playable = collection.items.some(record => record.audio?.length);
    if (audio.availability === 'none') {
        notices.push(reasonBlock(options, 'no-sentence-audio-source'));
    } else if (!playable) {
        // Reached both when the licence gate refused every recording and when
        // this page of results simply had none. Either way the honest statement
        // is the same: these sentences have no audio Yomu may play.
        notices.push(reasonBlock(options, 'no-licensed-audio'));
    } else if (audio.availability === 'per-item') {
        notices.push(helpBlock('audio-per-item', uiText(options.interfaceLanguage, 'exampleSourceAudioPerItem')));
    }
    if (options.capabilities.image.availability === 'none') notices.push(reasonBlock(options, 'no-image-source'));
    return notices.join('');
}

function componentAttribute(capabilities: ExampleSourceCapabilities): string {
    return (['text', 'audio', 'image'] as const)
        .filter(component => capabilities[component].availability !== 'none')
        .join(',');
}

function reasonBlock(options: ExampleSourceRowOptions, reason: ExampleAvailabilityReason): string {
    return helpBlock(reason, reasonText(options, reason));
}

function helpBlock(reason: string, message: string): string {
    return `<p class="jpdb-reader-help" data-example-reason="${escapeHtml(reason)}">${escapeHtml(message)}</p>`;
}

export function reasonText(options: ExampleSourceRowOptions, reason: ExampleAvailabilityReason): string {
    const language = options.interfaceLanguage;
    switch (reason) {
        case 'unsupported-target':
            return formatUiText(language, 'exampleSourceUnsupported', {
                language: languageName(options.targetLanguage, language),
            });
        case 'limited-corpus':
            return uiText(language, 'exampleSourceLimitedCorpus');
        case 'no-results':
            return uiText(language, 'exampleSourceEmpty');
        case 'no-licensed-audio':
            return uiText(language, 'exampleSourceNoLicensedAudio');
        case 'no-sentence-audio-source':
            return formatUiText(language, 'exampleSourceNoSentenceAudio', {
                language: languageName(options.targetLanguage, language),
            });
        case 'no-image-source':
            return uiText(language, 'exampleSourceNoImage');
        case 'no-human-translation':
            return formatUiText(language, 'exampleSourceNoTranslation', {
                language: languageName(options.outputLanguage, language),
            });
        case 'auth':
        case 'network':
        case 'schema':
            return uiText(language, 'exampleSourceFailed');
    }
}

/**
 * Names a language in the INTERFACE locale, so an English UI says "Spanish" and
 * a Japanese UI says スペイン語 for the same target. Falls back to the tag
 * rather than to English: a bare `sh` is less misleading than a wrong name.
 */
function languageName(tag: string, interfaceLanguage: InterfaceLanguage): string {
    const locale = resolveUiLanguage(interfaceLanguage);
    try {
        return new Intl.DisplayNames([locale], { type: 'language' }).of(tag) ?? tag;
    } catch {
        return tag;
    }
}

function renderExampleRecord(record: ExampleRecord, options: ExampleSourceRowOptions): string {
    const audio = record.audio?.[0];
    return `
        <li class="jpdb-reader-jpdb-example" data-provider-example-id="${escapeHtml(record.id)}">
            <div class="jpdb-reader-jpdb-example-row${audio ? ' has-audio' : ''}">
                ${audio ? renderAudioButton(audio.url, options.interfaceLanguage) : ''}
                <div class="jpdb-reader-jpdb-example-text">
                    <div class="jpdb-reader-example-sentence" lang="${escapeHtml(record.text.language)}" dir="auto" data-provider-example-sentence>${escapeHtml(record.text.value)}</div>
                    ${renderTranslation(record, options)}
                    ${renderProvenance(record, options)}
                </div>
            </div>
        </li>
    `;
}

function renderTranslation(record: ExampleRecord, options: ExampleSourceRowOptions): string {
    if (!record.translation) return reasonBlock(options, 'no-human-translation');
    const blurred = options.blurTranslations ?? false;
    return `<div class="jpdb-reader-example-translation"
        lang="${escapeHtml(record.translation.language)}"
        dir="auto"
        data-provider-example-translation
        data-translation-provenance="${escapeHtml(record.translation.provenance)}"
        ${blurred ? 'data-provider-translation-blurred="true" role="button" tabindex="0" aria-label="' + escapeHtml(uiText(options.interfaceLanguage, 'revealTranslation')) + '"' : ''}
        >${escapeHtml(record.translation.value)}</div>`;
}

/**
 * Source, licence and attribution on every record. Share-alike and CC BY both
 * require the credit to travel with the sentence, and the link has to open the
 * precise record rather than the site's front page.
 */
function renderProvenance(record: ExampleRecord, options: ExampleSourceRowOptions): string {
    const marks: string[] = [];
    if (record.translation?.provenance === 'machine') marks.push(uiText(options.interfaceLanguage, 'exampleSourceMachineTranslation'));
    if (record.translation && record.translation.direct === false) marks.push(uiText(options.interfaceLanguage, 'exampleSourceIndirectTranslation'));
    const audioCredit = record.audio?.[0];
    return `<div class="jpdb-reader-example-provenance" data-example-provenance>
        <a href="${escapeHtml(record.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(record.source.attribution)}</a>
        <span data-example-licence>${escapeHtml(record.source.licence)}</span>
        ${audioCredit ? `<span data-example-audio-licence>${escapeHtml(`${audioCredit.attribution} · ${audioCredit.licence.id}`)}</span>` : ''}
        ${marks.map(mark => `<span data-example-translation-mark>${escapeHtml(mark)}</span>`).join('')}
    </div>`;
}

function renderAudioButton(url: string, interfaceLanguage: InterfaceLanguage): string {
    const label = uiText(interfaceLanguage, 'exampleSourcePlayAudio');
    return `<button class="jpdb-reader-icon-mini jpdb-reader-jpdb-example-audio" type="button" data-action="play-example-audio" data-example-audio-url="${escapeHtml(url)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${speakerIcon()}</button>`;
}
