import { escapeHtml } from './dom';
import type { JpdbPageCompound, JpdbPageExample } from './jpdb-page-targets';
import type { RtkInfo } from './rtk';
import type { ReaderSettings } from './types';
import { glossaryToHtml, type YomitanTermEntry } from './yomitan';

export function renderRtkPanel(info: RtkInfo, initiallyExpanded = true, sourceAttributes = ''): string {
    const attributes = sourceAttributes || (initiallyExpanded ? 'open' : '');
    return `
        <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-rtk-source" ${attributes}>
            <summary class="jpdb-reader-local-title">RTK</summary>
            <div class="jpdb-reader-local-entry yomu-jpdb-collapsible-body">${renderRtkPanelBody(info)}</div>
        </details>
    `;
}

function renderRtkPanelBody(info: RtkInfo): string {
    return `
        ${rtkFrameMeta(info)}
        <div class="yomu-jpdb-facts">
            <span><strong>Keyword</strong>${escapeHtml(info.keyword)}</span>
            ${rtkReadingsFact(info)}
            ${info.elements ? `<span><strong>Elements</strong>${escapeHtml(info.elements)}</span>` : ''}
        </div>
        ${rtkStorySections(info)}
    `;
}

function rtkFrameMeta(info: RtkInfo): string {
    return info.frameNumber ? `<div class="yomu-jpdb-source-meta">#${escapeHtml(info.frameNumber)}</div>` : '';
}

function rtkReadingsFact(info: RtkInfo): string {
    const readings = [info.onYomi ? `On: ${info.onYomi}` : '', info.kunYomi ? `Kun: ${info.kunYomi}` : ''].filter(Boolean).join(' · ');
    return readings ? `<span><strong>Readings</strong>${escapeHtml(readings)}</span>` : '';
}

function rtkStorySections(info: RtkInfo): string {
    return [
        info.heisigStory ? `<section><h6>Heisig story</h6><p>${escapeHtml(info.heisigStory)}</p></section>` : '',
        info.heisigComment ? `<section><h6>Heisig comment</h6><p>${escapeHtml(info.heisigComment)}</p></section>` : '',
        info.koohiiStories.length ? `<section><h6>Koohii stories</h6>${info.koohiiStories.map(story => `<p>${escapeHtml(story)}</p>`).join('')}</section>` : '',
    ].join('');
}

export function renderLocalDictionaryPanel(entries: YomitanTermEntry[], settings: ReaderSettings, sourceStateAttributes: (dictionary: string) => string): string {
    const byDictionary = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const list = byDictionary.get(entry.dictionary) ?? [];
        list.push(entry);
        byDictionary.set(entry.dictionary, list);
    }
    return `
        ${[...byDictionary.entries()].map(([dictionary, dictionaryEntries]) => `
            <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group" data-dictionary="${escapeHtml(dictionary)}" ${sourceStateAttributes(dictionary)}>
                <summary class="jpdb-reader-local-head">
                    <span class="jpdb-reader-example-source">${escapeHtml(dictionaryLabel(dictionary, settings))}</span>
                    <span class="jpdb-reader-local-dict">${dictionaryEntries.length}</span>
                </summary>
                <div class="jpdb-reader-local-glossary jpdb-reader-parseable" data-dictionary="${escapeHtml(dictionary)}">
                    ${dictionaryEntries.slice(0, 3).map(entry => `
                        <div>
                            <strong>${escapeHtml(entry.expression)}</strong>${entry.reading && entry.reading !== entry.expression ? ` <span class="jpdb-reader-local-reading">${escapeHtml(entry.reading)}</span>` : ''}
                            ${entry.glossary.slice(0, 3).map(item => `<div>${glossaryToHtml(item, entry.dictionary, { internalSearchLinks: true })}</div>`).join('')}
                        </div>
                    `).join('')}
                </div>
            </details>
        `).join('')}
    `;
}

export function renderJpdbDictionarySupplement(
    compounds: JpdbPageCompound[],
    examples: JpdbPageExample[],
    sourceAttributes = '',
    examplesSourceAttributes = '',
): string {
    if (!compounds.length && !examples.length) return '';
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-page-dictionary" ${sourceAttributes}>
            <summary class="jpdb-reader-local-head">
                <span class="jpdb-reader-example-source">JPDB</span>
                <span class="jpdb-reader-local-dict">${compounds.length + examples.length}</span>
            </summary>
            <div class="jpdb-reader-local-glossary">
                ${renderJpdbSupplementCompounds(compounds)}
                ${renderJpdbSupplementExamples(examples, examplesSourceAttributes)}
            </div>
        </details>
    `;
}

function renderJpdbSupplementCompounds(compounds: JpdbPageCompound[]): string {
    if (!compounds.length) return '';
    return `<section class="yomu-jpdb-dictionary-section">
        <div class="yomu-jpdb-compounds">
            ${compounds.map(renderJpdbSupplementCompound).join('')}
        </div>
    </section>`;
}

function renderJpdbSupplementCompound(compound: JpdbPageCompound): string {
    const href = compoundHref(compound);
    const disabledAttrs = compoundDisabledAttrs(compound);
    const readingHtml = compoundReadingHtml(compound);
    const meaningHtml = compoundMeaningHtml(compound);
    return `
        <a class="yomu-jpdb-compound" href="${escapeHtml(href)}" ${disabledAttrs}>
            <span class="yomu-jpdb-compound-head">
                <span class="yomu-jpdb-compound-term jpdb-reader-parseable" data-dictionary="JPDB">${escapeHtml(compound.term)}</span>
                ${readingHtml}
            </span>
            ${meaningHtml}
        </a>
    `;
}

function compoundHref(compound: JpdbPageCompound): string {
    return compound.url || '#';
}

function compoundDisabledAttrs(compound: JpdbPageCompound): string {
    return compound.url ? '' : 'aria-disabled="true"';
}

function compoundReadingHtml(compound: JpdbPageCompound): string {
    return compound.reading && compound.reading !== compound.term
        ? `<span class="yomu-jpdb-compound-reading">${escapeHtml(compound.reading)}</span>`
        : '';
}

function compoundMeaningHtml(compound: JpdbPageCompound): string {
    return compound.meaning ? `<span class="yomu-jpdb-compound-meaning">${escapeHtml(compound.meaning)}</span>` : '';
}

function renderJpdbSupplementExamples(examples: JpdbPageExample[], examplesSourceAttributes: string): string {
    if (!examples.length) return '';
    return `<details class="jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-page-examples-group" ${examplesSourceAttributes || 'open'}>
        <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
            <span class="jpdb-reader-example-source">JPDB examples</span>
            <span class="jpdb-reader-source-status jpdb-reader-example-count">${examples.length}</span>
        </summary>
        <div class="jpdb-reader-local-glossary">
        <div class="yomu-jpdb-page-examples">
            ${examples.map(renderJpdbSupplementExample).join('')}
        </div>
        </div>
    </details>`;
}

function renderJpdbSupplementExample(example: JpdbPageExample): string {
    return `
        <div class="yomu-jpdb-page-example">
            <div class="jpdb-reader-example-sentence jpdb-reader-parseable">${escapeHtml(example.sentence)}</div>
            ${example.translation ? `<div class="jpdb-reader-example-translation jpdb-reader-parseable">${escapeHtml(example.translation)}</div>` : ''}
        </div>
    `;
}

function dictionaryLabel(name: string, settings: ReaderSettings): string {
    return settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
}
