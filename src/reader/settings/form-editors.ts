import { escapeHtml, setInnerHtml } from '../dom/index';
import { audioSourceLabel, uiText } from '../app/i18n';
import { settingsText } from './settings-text';
import { speakerIcon } from '../ui/icons';
import { AUDIO_SOURCE_UI_TYPE_VALUES, DEFAULT_AUDIO_SOURCES, defaultDictionaryLookupLinks, MAX_EXTRA_LOOKUP_LINKS, normalizeDictionaryLookupLinks } from './index';
import { audioSubSourceNameKey } from '../audio/source-resolution';
import { knownAudioSubSourceNames } from '../audio/candidates';
import { moveSourceRow } from './form-order';
import { readAudioSources, readDictionaryLookupLinks } from './form-read';
import { lookupSiteComponents, missingLookupComponents, type LookupLinkComponent } from './lookup-links';
import { miniIconButton, renderRowOrderTools, renderRowRemoveTools } from './form-source-rows';
import type { AudioSourceSetting, AudioSourceType, AudioSubSourceSetting, DictionaryLookupLink, DictionaryPreference, InterfaceLanguage } from '../app/types';

type SettingsTextKey = Parameters<typeof uiText>[1];

const AUDIO_URL_PLACEHOLDER_KEYS: Record<string, SettingsTextKey> = {
    'custom-json': 'audioCustomJsonPlaceholder',
    custom: 'audioCustomUrlPlaceholder',
};

const JITEN_TTS_VOICE_OPTIONS: Array<[string, string]> = [
    ['', 'Random Jiten voice'],
    ['female', 'Female'],
    ['female2', 'Female 2'],
    ['male', 'Male'],
    ['male2', 'Male 2'],
    ['asmr', 'ASMR'],
];

const JPDB_TTS_VOICE_OPTIONS: Array<[string, string]> = [
    ['', 'Random JPDB voice'],
    ['f1', 'Female 1'],
    ['f2', 'Female 2'],
    ['m1', 'Male 1'],
    ['m2', 'Male 2'],
];

type AudioVoiceKind = 'browser' | 'jiten' | 'jpdb' | 'none';

function escapedUiText(language: InterfaceLanguage, key: SettingsTextKey): string {
    return escapeHtml(uiText(language, key));
}

export function renderAudioSourceEditor(sources: AudioSourceSetting[], language: InterfaceLanguage = 'en'): string {
    return `
        <div class="jpdb-reader-audio-source-head jpdb-reader-order-head">
            <span>${escapedUiText(language, 'enabledHeader')}</span>
            <span>${escapedUiText(language, 'audioSource')}</span>
            <span>${escapedUiText(language, 'urlVoice')}</span>
            <span>${escapedUiText(language, 'orderHeader')}</span>
            <span>${escapedUiText(language, 'removeHeader')}</span>
        </div>
        ${renderAudioSourceRows(audioSourceRowsForSettings(sources), language)}
        <button class="jpdb-reader-btn" type="button" data-action="audio-source-add">${escapedUiText(language, 'addAudioSource')}</button>
    `;
}

function renderAudioSourceRows(rows: AudioSourceSetting[], language: InterfaceLanguage): string {
    const count = rows.length;
    const orderTools = renderRowOrderTools({
        label: uiText(language, 'audioSourceOrder'),
        upAction: 'audio-source-up',
        downAction: 'audio-source-down',
        labels: {
            drag: uiText(language, 'dragToReorder'),
            up: uiText(language, 'moveUp'),
            down: uiText(language, 'moveDown'),
        },
    });
    const removeTools = renderRowRemoveTools(miniIconButton('remove', uiText(language, 'remove'), 'data-action="audio-source-remove"'));

    return `
        <input type="hidden" name="audioSourceCount" value="${count}">
        ${rows.map((source, index) => `
            <div class="jpdb-reader-audio-source-row jpdb-reader-order-row" data-source-row data-audio-source-row data-source-id="audio-${index}">
                <label class="inline jpdb-reader-audio-index jpdb-reader-order-toggle">
                    <input name="audioSources.${index}.enabled" type="checkbox" aria-label="${escapeHtml(uiText(language, 'enableAudioSourceNumber').replace('{number}', String(index + 1)))}" ${source.enabled ? 'checked' : ''}>
                    <span>${index + 1}</span>
                </label>
                <div class="jpdb-reader-audio-source-choice">
                    <select name="audioSources.${index}.type" aria-label="${escapeHtml(uiText(language, 'audioSourceNumber').replace('{number}', String(index + 1)))}">
                        ${audioSourceSelectOptions(source.type, language).map(([optionValue, text]) =>
                            `<option value="${escapeHtml(optionValue)}" ${optionValue === source.type ? 'selected' : ''}>${escapeHtml(text)}</option>`,
                        ).join('')}
                    </select>
                    <button type="button" class="jpdb-reader-icon-mini" data-action="preview-audio" title="${escapedUiText(language, 'previewAudio')}" aria-label="${escapedUiText(language, 'previewAudio')}">${speakerIcon()}</button>
                </div>
                <div class="jpdb-reader-audio-source-fields">
                    <input data-audio-url-field name="audioSources.${index}.url" type="text" value="${escapeHtml(source.url)}" placeholder="${escapeHtml(audioUrlPlaceholder(source.type, language))}" ${audioSourceUsesUrl(source.type) ? '' : 'hidden'}>
                    <select data-audio-voice-field data-audio-voice-kind="${audioSourceVoiceKind(source.type)}" name="audioSources.${index}.voice" aria-label="${escapeHtml(uiText(language, 'textToSpeechVoiceNumber').replace('{number}', String(index + 1)))}" data-selected-voice="${escapeHtml(source.voice)}" ${audioSourceUsesVoice(source.type) ? '' : 'hidden'}>
                        ${audioVoiceSelectOptions(source, language)}
                    </select>
                </div>
                ${orderTools}
                ${removeTools}
                ${renderAudioSubSourcePanel(index, source, rows, language)}
            </div>
        `).join('')}
    `;
}

// Aggregator URLs (type custom-json) can answer with several named providers
// per word. The panel lists every provider the URL reported so users can turn
// individual ones off without dropping the whole source. Providers seen during
// ordinary lookups are merged in, so the list is already populated for a URL
// that has played audio before the settings dialog probes anything.
function renderAudioSubSourcePanel(index: number, source: AudioSourceSetting, rows: AudioSourceSetting[], language: InterfaceLanguage): string {
    const visible = source.type === 'custom-json';
    return `
        <div class="jpdb-reader-audio-subsources" data-audio-subsources ${visible ? '' : 'hidden'}>
            <div class="jpdb-reader-audio-subsource-list" data-audio-subsource-list>
                ${renderAudioSubSourceList(index, audioSubSourcesForRow(source), rows, language)}
            </div>
            <span class="jpdb-reader-audio-subsource-status" data-audio-subsource-status hidden></span>
        </div>
    `;
}

function audioSubSourcesForRow(source: AudioSourceSetting): AudioSubSourceSetting[] {
    return mergeAudioSubSources(source.subSources ?? [], knownAudioSubSourceNames(source.url));
}

export function renderAudioSubSourceList(index: number, subSources: AudioSubSourceSetting[], rows: AudioSourceSetting[], language: InterfaceLanguage): string {
    const help = subSources.length
        ? `<span class="jpdb-reader-audio-subsource-help">${escapedUiText(language, 'audioSubSourcesHelp')}</span>`
        : '';
    return `
        <input type="hidden" name="audioSources.${index}.subSourceCount" value="${subSources.length}">
        ${help}
        ${subSources.map((subSource, subIndex) => renderAudioSubSourceRow(index, subIndex, subSource, rows, language)).join('')}
    `;
}

function renderAudioSubSourceRow(index: number, subIndex: number, subSource: AudioSubSourceSetting, rows: AudioSourceSetting[], language: InterfaceLanguage): string {
    const overlap = audioSubSourceOverlapsEnabledRow(subSource, index, rows)
        ? `<span class="jpdb-reader-audio-subsource-overlap">${escapedUiText(language, 'audioSubSourceOverlapHint')}</span>`
        : '';
    const toggleLabel = uiText(language, 'enableSourceName').replace('{name}', subSource.name);
    return `
        <label class="inline jpdb-reader-audio-subsource">
            <input type="checkbox" name="audioSources.${index}.subSources.${subIndex}.enabled" aria-label="${escapeHtml(toggleLabel)}" ${subSource.enabled ? 'checked' : ''}>
            <span>${escapeHtml(subSource.name)}</span>
            ${overlap}
        </label>
        <input type="hidden" name="audioSources.${index}.subSources.${subIndex}.name" value="${escapeHtml(subSource.name)}">
    `;
}

// Providers surfaced inside an aggregator can duplicate stand-alone source
// rows (the hosted URL hands out JapanesePod101 clips, and so does the
// dedicated JapanesePod101 row). Flag the overlap so users can keep one.
const AUDIO_SUB_SOURCE_OVERLAP_TYPES: Record<string, AudioSourceType[]> = {
    jpod: ['jpod101', 'language-pod-101'],
    jpod101: ['jpod101', 'language-pod-101'],
    japanesepod101: ['jpod101', 'language-pod-101'],
    languagepod101: ['language-pod-101'],
    jisho: ['jisho'],
    bunpro: ['bunpro'],
    wiktionary: ['wiktionary'],
    'lingua libre': ['lingua-libre'],
    'lingua-libre': ['lingua-libre'],
};

export function mergeAudioSubSources(existing: AudioSubSourceSetting[], detectedNames: string[]): AudioSubSourceSetting[] {
    const merged = existing.map(subSource => ({ ...subSource }));
    const seen = new Set(merged.map(subSource => audioSubSourceNameKey(subSource.name)));
    for (const name of detectedNames) {
        const trimmed = name.trim();
        const key = audioSubSourceNameKey(trimmed);
        if (!trimmed || seen.has(key)) continue;
        seen.add(key);
        merged.push({ name: trimmed, enabled: true });
    }
    return merged;
}

function audioSubSourceOverlapsEnabledRow(subSource: AudioSubSourceSetting, rowIndex: number, rows: AudioSourceSetting[]): boolean {
    if (!subSource.enabled) return false;
    const overlapTypes = AUDIO_SUB_SOURCE_OVERLAP_TYPES[audioSubSourceNameKey(subSource.name)];
    if (!overlapTypes) return false;
    return rows.some((row, index) => index !== rowIndex && row.enabled && overlapTypes.includes(row.type));
}

function audioSourceSelectOptions(type: AudioSourceSetting['type'], language: InterfaceLanguage): [AudioSourceSetting['type'], string][] {
    if (type === 'custom') {
        return [
            ...AUDIO_SOURCE_UI_TYPE_VALUES.map(value => [value, audioSourceLabel(language, value)] as [AudioSourceSetting['type'], string]),
            ['custom', uiText(language, 'customAdvanced').replace('{label}', audioSourceLabel(language, 'custom'))],
        ];
    }
    return AUDIO_SOURCE_UI_TYPE_VALUES.map(value => [value, audioSourceLabel(language, value)] as [AudioSourceSetting['type'], string]);
}

function audioSourceRowsForSettings(sources: AudioSourceSetting[]): AudioSourceSetting[] {
    const rows = sources.map(source => ({ ...source }));
    return rows.length ? rows : DEFAULT_AUDIO_SOURCES.map(source => ({ ...source }));
}

function audioUrlPlaceholder(type: AudioSourceSetting['type'], language: InterfaceLanguage): string {
    return uiText(language, audioUrlPlaceholderKey(type));
}

export function audioUrlPlaceholderKey(type: string | undefined): SettingsTextKey {
    return AUDIO_URL_PLACEHOLDER_KEYS[type ?? ''] ?? 'audioBuiltInPlaceholder';
}

function audioSourceUsesUrl(type: string): boolean {
    return type === 'custom' || type === 'custom-json';
}

function audioSourceUsesVoice(type: string): boolean {
    return audioSourceVoiceKind(type) !== 'none';
}

function audioSourceVoiceKind(type: string): AudioVoiceKind {
    if (type === 'jiten-tts') return 'jiten';
    if (type === 'jpdb-tts') return 'jpdb';
    if (type === 'text-to-speech' || type === 'text-to-speech-reading') return 'browser';
    return 'none';
}

function audioVoiceSelectOptions(source: AudioSourceSetting, language: InterfaceLanguage): string {
    if (audioSourceVoiceKind(source.type) === 'jiten') return jitenTtsVoiceSelectOptions(source.voice);
    if (audioSourceVoiceKind(source.type) === 'jpdb') return jpdbTtsVoiceSelectOptions(source.voice);
    const label = source.voice || uiText(language, 'automaticBrowserVoice');
    return `<option value="${escapeHtml(source.voice)}">${escapeHtml(label)}</option>`;
}

function jitenTtsVoiceSelectOptions(selectedVoice: string): string {
    const selected = selectedVoice.trim();
    const options = JITEN_TTS_VOICE_OPTIONS.map(([value, label]) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`,
    );
    if (selected && !JITEN_TTS_VOICE_OPTIONS.some(([value]) => value === selected)) {
        options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
    }
    return options.join('');
}

function jpdbTtsVoiceSelectOptions(selectedVoice: string): string {
    const selected = selectedVoice.trim();
    const options = JPDB_TTS_VOICE_OPTIONS.map(([value, label]) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`,
    );
    if (selected && !JPDB_TTS_VOICE_OPTIONS.some(([value]) => value === selected)) {
        options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
    }
    return options.join('');
}

export function syncAudioSourceRow(row: Element | null, type: string): void {
    if (!row) return;
    row.querySelectorAll<HTMLElement>('[data-audio-url-field]').forEach(node => { node.hidden = !audioSourceUsesUrl(type); });
    row.querySelectorAll<HTMLElement>('[data-audio-subsources]').forEach(node => { node.hidden = type !== 'custom-json'; });
    row.querySelectorAll<HTMLElement>('[data-audio-voice-field]').forEach(node => {
        const voiceKind = audioSourceVoiceKind(type);
        node.hidden = voiceKind === 'none';
        node.dataset.audioVoiceKind = voiceKind;
        if (node instanceof HTMLSelectElement && voiceKind === 'jiten') {
            const selected = node.value || node.dataset.selectedVoice || '';
            setInnerHtml(node, jitenTtsVoiceSelectOptions(selected));
        }
        if (node instanceof HTMLSelectElement && voiceKind === 'jpdb') {
            const selected = node.value || node.dataset.selectedVoice || '';
            setInnerHtml(node, jpdbTtsVoiceSelectOptions(selected));
        }
    });
}

export function syncBrowserTtsVoiceOptions(form: HTMLFormElement): void {
    const voices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
    const language: InterfaceLanguage = form.lang === 'ja' ? 'ja' : 'en';
    const text = settingsText(language);
    const sortedVoices = voices.slice().sort((a, b) => {
        const aJapanese = a.lang.toLowerCase().startsWith('ja') ? 0 : 1;
        const bJapanese = b.lang.toLowerCase().startsWith('ja') ? 0 : 1;
        return aJapanese - bJapanese
            || a.lang.localeCompare(b.lang)
            || a.name.localeCompare(b.name);
    });

    form.querySelectorAll<HTMLSelectElement>('select[data-audio-voice-field][data-audio-voice-kind="browser"]').forEach(select => {
        const selected = select.value || select.dataset.selectedVoice || '';
        const options = [
            `<option value="" ${selected ? '' : 'selected'}>${escapeHtml(text('automaticBrowserVoice'))}</option>`,
            ...sortedVoices.map(voice => {
                const label = `${voice.name}${voice.lang ? ` (${voice.lang})` : ''}${voice.default ? ` - ${text('defaultVoiceSuffix')}` : ''}`;
                return `<option value="${escapeHtml(voice.name)}" ${voice.name === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
            }),
        ];
        if (selected && !sortedVoices.some(voice => voice.name === selected)) {
            options.push(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(text('savedVoiceLabel').replace('{voice}', selected))}</option>`);
        }
        setInnerHtml(select, options.join(''));
    });
}

export function isAudioSourceTypeValue(value: string): value is AudioSourceSetting['type'] {
    return (AUDIO_SOURCE_UI_TYPE_VALUES as readonly string[]).includes(value) || value === 'custom';
}

export function updateAudioSourceEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-audio-sources');
    if (!container) return;
    const row = control?.closest<HTMLElement>('[data-audio-source-row]');
    const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-audio-source-row]'));
    const index = row ? rows.indexOf(row) : -1;

    if (isAudioSourceMoveAction(action)) {
        moveSourceRow(container, index, audioSourceMoveTargetIndex(action, index));
        return;
    }

    const sources = audioSourceRowsForSettings(readAudioSources(new FormData(form)));
    updateAudioSourceRows(sources, action, index);
    setInnerHtml(container, renderAudioSourceEditor(sources, form.lang === 'ja' ? 'ja' : 'en'));
}

function isAudioSourceMoveAction(action: string): boolean {
    return action === 'audio-source-up' || action === 'audio-source-down';
}

function audioSourceMoveTargetIndex(action: string, index: number): number {
    return action === 'audio-source-up' ? index - 1 : index + 1;
}

function updateAudioSourceRows(sources: AudioSourceSetting[], action: string, index: number): void {
    if (action === 'audio-source-add') addAudioSourceRow(sources);
    if (action === 'audio-source-remove') removeAudioSourceRow(sources, index);
}

function addAudioSourceRow(sources: AudioSourceSetting[]): void {
    if (sources.length < 12) sources.push({ type: 'custom-json', url: '', voice: '', enabled: true });
}

function removeAudioSourceRow(sources: AudioSourceSetting[], index: number): void {
    if (index >= 0 && sources.length > 1) sources.splice(index, 1);
}

export function renderDictionaryLookupLinkEditor(
    links: DictionaryLookupLink[],
    localFrequencyPreferences: DictionaryPreference[] = [],
    targetLanguage = 'ja',
): string {
    const rows = lookupPillEditorRows(links, localFrequencyPreferences, targetLanguage);
    return `
        <div class="jpdb-reader-lookup-link-head jpdb-reader-order-head">
            <span>On</span>
            <span>Label</span>
            <span>URL template</span>
            <span>Order</span>
            <span>Remove</span>
        </div>
        ${renderDictionaryLookupLinkRows(rows, targetLanguage)}
        ${renderLookupLinkComponentGaps(targetLanguage)}
        <div class="jpdb-reader-lookup-link-actions">
            <button class="jpdb-reader-btn add" type="button" data-action="lookup-link-add">Add</button>
        </div>
    `;
}

const LOOKUP_COMPONENT_LABELS: Record<LookupLinkComponent, string> = {
    definition: 'Definitions',
    sentences: 'Example sentences',
    audio: 'Audio',
    images: 'Images',
};

/**
 * What a built-in site actually hands back, beside its own row.
 *
 * U46's rule is that a component is claimed only where it was measured, so an
 * unlisted component is a statement and not a gap in the data: Treccani has
 * usage examples and no recordings, MDBG has neither, and both say so.
 */
function renderLookupLinkNotes(targetLanguage: string, link: DictionaryLookupLink): string {
    const components = lookupSiteComponents(targetLanguage, link.id);
    const opensOverPlaintextHttp = /^http:\/\//i.test(link.urlTemplate);
    if (!components.length && !opensOverPlaintextHttp) return '';
    const note = components.map(component => LOOKUP_COMPONENT_LABELS[component]).join(' · ');
    const separator = components.length && opensOverPlaintextHttp ? ' · ' : '';
    const transport = opensOverPlaintextHttp
        ? `<span data-lookup-link-transport>${escapedUiText('en', 'plaintextHttpLink')}</span>`
        : '';
    return `<span class="jpdb-reader-lookup-link-note" data-lookup-link-note="${components.length ? 'components' : 'transport'}"${components.length ? ` data-lookup-link-components="${escapeHtml(components.join(' '))}"` : ''}>${escapeHtml(note)}${separator}${transport}</span>`;
}

/**
 * The components no site in this target's row can supply.
 *
 * This is the same reversal U46 applied to the example panels, moved to the pill
 * editor: a learner of Ancient Greek is told there is no pronunciation site
 * rather than left to wonder why no pill plays anything, and only Chinese and
 * Cantonese are told nothing about images because only they have an image site.
 */
function renderLookupLinkComponentGaps(targetLanguage: string): string {
    const missing = missingLookupComponents(targetLanguage);
    if (!missing.length) return '';
    const names = missing.map(component => LOOKUP_COMPONENT_LABELS[component].toLowerCase()).join(', ');
    return `<p class="jpdb-reader-help" data-lookup-link-gap="${escapeHtml(missing.join(' '))}">No verified site for this language offers ${escapeHtml(names)}. Add your own above if you know one.</p>`;
}

function renderDictionaryLookupLinkRows(rows: DictionaryLookupLink[], targetLanguage: string): string {
    const orderTools = renderRowOrderTools({
        label: 'Lookup pill order',
        upAction: 'lookup-link-up',
        downAction: 'lookup-link-down',
        labels: { drag: 'Drag to reorder', up: 'Move up', down: 'Move down' },
    });
    return `
        <input type="hidden" name="dictionaryLookupLinkCount" value="${rows.length}">
        ${rows.map((link, index) => {
            const isCopyAction = link.action === 'copy';
            const isFrequencyAction = link.action === 'frequency-live' || link.action === 'frequency-local';
            const urlControl = isCopyAction
                ? `<span class="jpdb-reader-lookup-link-note" data-lookup-link-note="copy">Copies the current word</span><input name="dictionaryLookupLinks.${index}.urlTemplate" type="hidden" value="">`
                : isFrequencyAction
                    ? `<span class="jpdb-reader-lookup-link-note" data-lookup-link-note="frequency">${escapeHtml(frequencyLookupPillNote(link))}</span><input name="dictionaryLookupLinks.${index}.urlTemplate" type="hidden" value="">`
                    : `<input name="dictionaryLookupLinks.${index}.urlTemplate" type="text" value="${escapeHtml(link.urlTemplate)}" placeholder="https://takoboto.jp/?q={query}" aria-label="Lookup URL template">${renderLookupLinkNotes(targetLanguage, link)}`;
            const removeControl = isCopyAction || isFrequencyAction
                ? '<span class="jpdb-reader-lookup-link-fixed" aria-label="Built-in action"></span>'
                : miniIconButton('remove', 'Remove', 'data-action="lookup-link-remove"');
            return `
                <div class="jpdb-reader-lookup-link-row jpdb-reader-order-row" data-source-row data-lookup-link-row data-source-id="lookup-link-${index}" data-index="${index}">
                    <label class="inline jpdb-reader-dictionary-toggle jpdb-reader-order-toggle">
                        <input name="dictionaryLookupLinks.${index}.enabled" type="checkbox" data-lookup-link-enable-toggle ${link.enabled ? 'checked' : ''}>
                        <span>${index + 1}</span>
                    </label>
                    <input name="dictionaryLookupLinks.${index}.label" type="text" value="${escapeHtml(link.label)}" aria-label="Lookup pill label">
                    ${urlControl}
                    <input name="dictionaryLookupLinks.${index}.id" type="hidden" value="${escapeHtml(link.id)}">
                    <input name="dictionaryLookupLinks.${index}.action" type="hidden" value="${escapeHtml(link.action ?? 'open')}">
                    <input name="dictionaryLookupLinks.${index}.priority" type="hidden" value="${escapeHtml(String(link.priority ?? index))}">
                    ${orderTools}
                    ${renderRowRemoveTools(removeControl)}
                </div>
            `;
        }).join('')}
    `;
}

export function lookupPillEditorRows(
    links: DictionaryLookupLink[],
    localFrequencyPreferences: DictionaryPreference[],
    target: string,
): DictionaryLookupLink[] {
    const normalized = normalizeDictionaryLookupLinks(links, false, target);
    const byId = new Map(normalized.map(link => [link.id, link]));
    for (const preference of localFrequencyPreferences) {
        const id = localFrequencyLookupPillId(preference.name);
        if (!byId.has(id)) {
            byId.set(id, {
                id,
                label: preference.alias || preference.name,
                urlTemplate: '',
                enabled: true,
                action: 'frequency-local',
                priority: preference.priority,
            });
        }
    }
    return normalizeDictionaryLookupLinks(Array.from(byId.values()), false, target)
        .sort(compareLookupPillEditorRows);
}

function compareLookupPillEditorRows(a: DictionaryLookupLink, b: DictionaryLookupLink): number {
    const priority = (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER);
    if (priority) return priority;
    return a.id.localeCompare(b.id);
}

function localFrequencyLookupPillId(dictionary: string): string {
    return `frequency-local:${dictionary}`;
}

function frequencyLookupPillNote(link: DictionaryLookupLink): string {
    if (link.action === 'frequency-local') return 'Installed local frequency dictionary badge. Replaces matching live site frequency.';
    return link.id === 'jpdb-frequency'
        ? 'Live JPDB frequency from site lookup; no local dictionary install.'
        : 'Live Jiten frequency from site lookup; no local dictionary install.';
}

export function updateDictionaryLookupLinkEditor(form: HTMLFormElement, action: string, control?: HTMLElement | null): void {
    const container = form.querySelector<HTMLElement>('.jpdb-reader-lookup-links');
    if (!container) return;
    const row = control?.closest<HTMLElement>('[data-lookup-link-row]');
    const index = row ? Array.from(container.querySelectorAll('[data-lookup-link-row]')).indexOf(row) : -1;
    if (action === 'lookup-link-up' || action === 'lookup-link-down') {
        moveSourceRow(container, index, action === 'lookup-link-up' ? index - 1 : index + 1);
        return;
    }
    const data = new FormData(form);
    const links = readDictionaryLookupLinks(data);
    const target = formTargetLanguage(data);
    updateDictionaryLookupLinks(links, action, index, target);
    // The target lives in this same form, so re-rendering a row keeps the
    // component notes and the gap line describing the language on screen.
    setInnerHtml(container, renderDictionaryLookupLinkEditor(links, [], target));
}

function formTargetLanguage(data: FormData): string {
    return String(data.get('targetLanguage') ?? '') || 'ja';
}

function updateDictionaryLookupLinks(links: DictionaryLookupLink[], action: string, index: number, target: string): void {
    if (action === 'lookup-link-add') addDictionaryLookupLink(links, target);
    if (action === 'lookup-link-remove') removeDictionaryLookupLink(links, index);
}

function addDictionaryLookupLink(links: DictionaryLookupLink[], target: string): void {
    if (links.length >= defaultDictionaryLookupLinks('local', target).length
        + MAX_EXTRA_LOOKUP_LINKS) return;
    links.push({
        id: `custom-${Date.now().toString(36)}`,
        label: '',
        urlTemplate: 'https://takoboto.jp/?q={query}',
        enabled: true,
    });
}

function removeDictionaryLookupLink(links: DictionaryLookupLink[], index: number): void {
    if (index >= 0 && links.length > 1 && links[index]?.action !== 'copy') links.splice(index, 1);
}
