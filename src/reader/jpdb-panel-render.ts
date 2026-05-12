import { escapeHtml } from './dom';
import type { JpdbKanjiInfo } from './jpdb-kanji';
import type { RtkInfo } from './rtk';
import type { ReaderSettings } from './types';
import { glossaryToHtml, type YomitanTermEntry } from './yomitan';

export function renderRtkPanel(info: RtkInfo, initiallyExpanded = true): string {
    const readings = [info.onYomi ? `On: ${info.onYomi}` : '', info.kunYomi ? `Kun: ${info.kunYomi}` : ''].filter(Boolean).join(' · ');
    const title = `
        <span>RTK</span>
        ${info.frameNumber ? `<span class="yomu-jpdb-counter">#${escapeHtml(info.frameNumber)}</span>` : ''}
    `;
    const body = `
        <div class="yomu-jpdb-facts">
            <span><strong>Keyword</strong>${escapeHtml(info.keyword)}</span>
            ${readings ? `<span><strong>Readings</strong>${escapeHtml(readings)}</span>` : ''}
            ${info.elements ? `<span><strong>Elements</strong>${escapeHtml(info.elements)}</span>` : ''}
        </div>
        ${info.heisigStory ? `<section><h6>Heisig story</h6><p>${escapeHtml(info.heisigStory)}</p></section>` : ''}
        ${info.heisigComment ? `<section><h6>Heisig comment</h6><p>${escapeHtml(info.heisigComment)}</p></section>` : ''}
        ${info.koohiiStories.length ? `<section><h6>Koohii stories</h6>${info.koohiiStories.map(story => `<p>${escapeHtml(story)}</p>`).join('')}</section>` : ''}
    `;
    if (!initiallyExpanded) {
        return `
            <details class="yomu-jpdb-collapsible-card">
                <summary class="yomu-jpdb-card-title">${title}</summary>
                <div class="yomu-jpdb-collapsible-body">${body}</div>
            </details>
        `;
    }
    return `<div class="yomu-jpdb-card-title">${title}</div>${body}`;
}

export function renderJpdbKanjiPanel(info: JpdbKanjiInfo): string {
    const facts = [
        info.keyword ? ['Keyword', info.keyword] : null,
        info.frequency ? ['Frequency', info.frequency] : null,
        info.type ? ['Type', info.type] : null,
        info.kanken ? ['Kanken', info.kanken] : null,
        info.heisig ? ['Heisig', info.heisig] : null,
    ].filter((item): item is [string, string] => item !== null);
    return `
        <div class="yomu-jpdb-card-title">
            <span>JPDB kanji info</span>
            <a href="https://jpdb.io/kanji/${encodeURIComponent(info.kanji)}" target="_blank" rel="noopener">Open</a>
        </div>
        ${facts.length ? `<div class="yomu-jpdb-facts">${facts.map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`).join('')}</div>` : ''}
        ${info.readings.length ? `<div class="yomu-jpdb-chip-row" aria-label="Readings">${info.readings.slice(0, 10).map(reading => `<span class="${reading.common ? 'common' : ''}">${escapeHtml(reading.reading)}${reading.share ? ` <small>${escapeHtml(reading.share)}</small>` : ''}</span>`).join('')}</div>` : ''}
        ${info.components.length ? `<div class="yomu-jpdb-component-row" aria-label="Components">
            ${info.components.map(component => `<a href="https://jpdb.io/kanji/${encodeURIComponent(component.kanji)}" class="yomu-jpdb-component" target="_blank" rel="noopener"><strong>${escapeHtml(component.kanji)}</strong><span>${escapeHtml(component.keyword)}</span></a>`).join('')}
        </div>` : ''}
        ${info.vocabulary.length ? `<div class="yomu-jpdb-used-words" aria-label="Common words using ${escapeHtml(info.kanji)}">
            ${info.vocabulary.slice(0, 5).map(word => `<a href="${escapeHtml(word.url)}" target="_blank" rel="noopener"><span>${escapeHtml(word.expression)}</span><small>${escapeHtml(word.reading || word.meaning)}</small></a>`).join('')}
        </div>` : ''}
    `;
}

export function renderLocalDictionaryPanel(entries: YomitanTermEntry[], settings: ReaderSettings, sourceStateAttributes: (dictionary: string) => string): string {
    const byDictionary = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const list = byDictionary.get(entry.dictionary) ?? [];
        list.push(entry);
        byDictionary.set(entry.dictionary, list);
    }
    return `
        <div class="yomu-jpdb-card-title">Imported dictionaries</div>
        ${[...byDictionary.entries()].map(([dictionary, dictionaryEntries]) => `
            <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group" data-dictionary="${escapeHtml(dictionary)}" ${sourceStateAttributes(dictionary)}>
                <summary class="jpdb-reader-local-head">
                    <span>${escapeHtml(dictionaryLabel(dictionary, settings))}</span>
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

function dictionaryLabel(name: string, settings: ReaderSettings): string {
    return settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
}
