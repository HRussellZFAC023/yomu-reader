import { escapeHtml } from '../dom/index';
import { formatUiText, uiText } from '../app/i18n';
import { uniqueStrings } from '../core/string-utils';
import { checkbox, input, select } from './form-controls';
import { renderAnkiTagsEditor } from './form-tags';
import type { AnkiModelUpdatePlan } from '../anki/types';
import type { AnkiFieldMappingRole, InterfaceLanguage, JPDBDeck, ReaderSettings } from '../app/types';

const ANKI_FIELD_MAPPING_ROLES: AnkiFieldMappingRole[] = ['expression', 'reading', 'meaning', 'sentence', 'audio', 'image'];
const ANKI_MOBILE_FALLBACK_DECK = 'Default';

type AnkiMappingConfidence = 'high' | 'medium' | 'low';
type AnkiMappingConfidenceByRole = Partial<Record<AnkiFieldMappingRole, AnkiMappingConfidence>>;

interface AnkiStatusRender {
    tone: string;
    html: string;
}

type SettingsTextKey = Parameters<typeof uiText>[1];

function escapedUiText(language: InterfaceLanguage, key: SettingsTextKey): string {
    return escapeHtml(uiText(language, key));
}

export function renderAnkiMiningSettingsPanel(settings: ReaderSettings, ankiStatus: AnkiStatusRender): string {
    return `
            <fieldset id="jpdb-reader-settings-panel-mining" role="tabpanel" data-settings-panel="mining" data-legend-key="anki" aria-describedby="settings-help-anki" hidden>
                <legend>Anki</legend>
                <input type="hidden" name="ankiFieldMappings" value="${escapeHtml(JSON.stringify(settings.ankiFieldMappings))}">
                <input type="hidden" data-anki-scan-fields value="{}">
                <input type="hidden" data-anki-scan-confidence value="{}">
                <div class="jpdb-reader-anki-layout">
                    <div class="jpdb-reader-anki-main">
                        <div class="grid jpdb-reader-anki-connection-grid">
                            ${checkbox('ankiEnabled', 'Enable Anki mining', settings.ankiEnabled)}
                            ${checkbox('ankiMineWithJpdb', 'Also add to Anki when adding via API', settings.jpdbMiningEnabled && settings.ankiMineWithJpdb, { disabled: !settings.jpdbMiningEnabled })}
                            ${checkbox('ankiCaptureScreenshot', 'Attach context image when possible', settings.ankiCaptureScreenshot)}
                            ${checkbox('ankiMobileHandoff', 'Mobile Anki add-note fallback', settings.ankiMobileHandoff)}
                            ${input('ankiConnectUrl', 'AnkiConnect URL', settings.ankiConnectUrl)}
                            <div class="jpdb-reader-settings-wide jpdb-reader-help jpdb-reader-status-line" data-anki-status data-status-tone="${ankiStatus.tone}" role="status" aria-live="polite">${ankiStatus.html}</div>
                        </div>
                        <div class="jpdb-reader-settings-subsection">
                            <div id="settings-help-anki" class="jpdb-reader-help" data-anki-setup-help></div>
                            <div class="jpdb-reader-settings-actions jpdb-reader-anki-actions">
                                <button class="jpdb-reader-btn" type="button" data-action="test-anki">${escapedUiText(settings.interfaceLanguage, 'testAnki')}</button>
                                <button class="jpdb-reader-btn secondary" type="button" data-action="prepare-anki">${escapedUiText(settings.interfaceLanguage, 'prepareAnki')}</button>
                            </div>
                            <div class="jpdb-reader-anki-model-update" data-anki-model-update hidden>
                                <div class="jpdb-reader-help" data-anki-model-update-message></div>
                                <div class="jpdb-reader-settings-actions">
                                    <button class="jpdb-reader-btn" type="button" data-action="update-anki-model">${escapedUiText(settings.interfaceLanguage, 'updateAnkiModel')}</button>
                                </div>
                            </div>
                        </div>
                        <div class="jpdb-reader-settings-subsection jpdb-reader-anki-library-choice">
                            <div class="jpdb-reader-local-title" data-anki-library-choices-title>${escapedUiText(settings.interfaceLanguage, 'ankiLibraryChoices')}</div>
                            <div class="jpdb-reader-help" data-anki-library-choices-help>${escapedUiText(settings.interfaceLanguage, 'ankiLibraryChoicesHelp')}</div>
                            <div class="jpdb-reader-anki-choice-grid">
                                <label><span class="jpdb-reader-settings-label-text">Anki deck</span><select name="ankiDeck" data-anki-deck-options>${renderAnkiDeckLibraryOptions([settings.ankiDeck].filter(Boolean), settings.ankiDeck, settings.interfaceLanguage)}</select></label>
                                <label><span class="jpdb-reader-settings-label-text">Anki note type</span><select name="ankiModel" data-anki-model-options>${renderAnkiLibraryOptions([settings.ankiModel, ...Object.keys(settings.ankiFieldMappings)].filter(Boolean), settings.ankiModel, settings.interfaceLanguage)}</select></label>
                            </div>
                        </div>
                        <div class="jpdb-reader-settings-subsection jpdb-reader-anki-template-settings">
                            <div class="jpdb-reader-local-title" data-anki-template-settings-title>${escapedUiText(settings.interfaceLanguage, 'ankiTemplateSettings')}</div>
                            <div class="jpdb-reader-help" data-anki-template-settings-help>${escapedUiText(settings.interfaceLanguage, 'ankiTemplateSettingsHelp')}</div>
                            <div class="grid jpdb-reader-anki-card-grid">
                                ${select('ankiTemplateMode', 'Anki card template', settings.ankiTemplateMode, [['recognition', 'Word first'], ['context', 'Sentence first']])}
                                ${checkbox('ankiFrontReading', 'Word-first front: show reading', settings.ankiFrontReading)}
                                ${checkbox('ankiFrontSentence', 'Word-first front: show sentence', settings.ankiFrontSentence)}
                                ${checkbox('ankiFrontImage', 'Show image on front', settings.ankiFrontImage)}
                                ${renderAnkiTagsEditor(settings.ankiTags, settings.interfaceLanguage)}
                            </div>
                            <div data-anki-template-preview>
                                ${renderAnkiTemplatePreview(settings)}
                            </div>
                        </div>
                    </div>
                    <div class="jpdb-reader-settings-subsection jpdb-reader-anki-adapter" data-anki-library-adapter>
                        <div class="jpdb-reader-local-title" data-anki-library-adapter-title>Existing library adapter</div>
                        <div class="jpdb-reader-help" data-anki-library-availability>${escapedUiText(settings.interfaceLanguage, 'ankiLibraryAdapterStatus')}</div>
                        <div data-anki-field-mapping-editor>
                            ${renderAnkiFieldMappingEditor(settings, settings.ankiModel, [], settings.interfaceLanguage)}
                        </div>
                    </div>
                </div>
            </fieldset>
    `;
}

// Shown only while a Yomu note type is a release behind, and cleared the
// moment it matches (plan === null), so accepting the offer ends it. Nothing
// here writes to Anki: the button beside it does, on a click.
//
// The offer carries the note type it names, so accepting it can only ever
// widen that one — an offer left over from a different note type is declined,
// not retargeted.
export function applyAnkiModelUpdatePrompt(
    form: HTMLFormElement,
    plan: AnkiModelUpdatePlan | null,
    language: InterfaceLanguage,
): void {
    const prompt = form.querySelector<HTMLElement>('[data-anki-model-update]');
    if (!prompt) return;
    prompt.hidden = !plan;
    if (plan) prompt.dataset.ankiModelUpdateTarget = plan.modelName;
    else delete prompt.dataset.ankiModelUpdateTarget;
    const message = prompt.querySelector<HTMLElement>('[data-anki-model-update-message]');
    if (!message) return;
    message.textContent = plan
        ? formatUiText(language, 'ankiModelUpdateAvailable', {
            model: plan.modelName,
            fields: plan.missingFields.join(', '),
        })
        : '';
}

// The note type the offer on screen names, or null when there is no live
// offer. Accepting reads this, never the picker, so a prompt the user has
// moved past cannot aim the write at whatever is selected now.
export function ankiModelUpdatePromptTarget(form: HTMLFormElement): string | null {
    const prompt = form.querySelector<HTMLElement>('[data-anki-model-update]');
    if (!prompt || prompt.hidden) return null;
    return prompt.dataset.ankiModelUpdateTarget || null;
}

export function renderAnkiLibraryOptions(options: string[], value: string, language: InterfaceLanguage = 'en'): string {
    const values = uniqueStrings([value, ...options].filter(Boolean));
    const rows = values.map(option => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`);
    return rows.length ? rows.join('') : `<option value="" selected>${escapedUiText(language, 'scanAnkiFirst')}</option>`;
}

export function renderAnkiDeckLibraryOptions(options: string[], value: string, language: InterfaceLanguage = 'en'): string {
    return renderAnkiLibraryOptions([...options, ANKI_MOBILE_FALLBACK_DECK], value, language);
}

export function renderAnkiFieldMappingEditor(
    settings: ReaderSettings,
    modelName = settings.ankiModel,
    scannedFields: string[] = [],
    language: InterfaceLanguage = settings.interfaceLanguage,
    confidenceByRole: AnkiMappingConfidenceByRole = {},
): string {
    const model = modelName.trim();
    const mapping = model ? settings.ankiFieldMappings[model] ?? {} : {};
    const fields = uniqueStrings([...scannedFields, ...Object.values(mapping).filter(Boolean)]);
    const options = (selected = '') => [
        `<option value="" ${selected ? '' : 'selected'}>${escapedUiText(language, 'notMapped')}</option>`,
        ...fields.map(field => `<option value="${escapeHtml(field)}" ${field === selected ? 'selected' : ''}>${escapeHtml(field)}</option>`),
    ].join('');
    const rows = ANKI_FIELD_MAPPING_ROLES.map(role => {
        const value = mapping[role] ?? '';
        const roleLabel = ankiFieldMappingRoleLabel(role, language);
        const confidence = value ? confidenceByRole[role] : undefined;
        return `
                <label>
                    <span class="jpdb-reader-anki-field-role-row">
                        <span>${escapeHtml(roleLabel)}</span>
                        ${confidence ? renderAnkiMappingConfidence(confidence, language) : ''}
                    </span>
                    <select data-anki-field-role="${escapeHtml(role)}" aria-label="${escapeHtml(uiText(language, 'ankiFieldMappingSelect').replace('{role}', roleLabel))}">
                        ${options(value)}
                    </select>
                </label>
        `;
    }).join('');
    const emptyState = fields.length ? '' : `<div class="jpdb-reader-help">${escapedUiText(language, 'noScannedFields')}</div>`;
    return `
            <div data-anki-field-mapping-model="${escapeHtml(model)}">
                <div class="jpdb-reader-help">${escapeHtml(uiText(language, 'mappingForNoteType').replace('{model}', model || uiText(language, 'currentNoteType')))}</div>
                <div class="grid">
                    ${rows}
                </div>
                ${fields.length ? `<div class="jpdb-reader-help">${escapedUiText(language, 'ankiMappingConfidenceHelp')}</div>` : ''}
                ${emptyState}
            </div>
    `;
}

function renderAnkiMappingConfidence(confidence: AnkiMappingConfidence, language: InterfaceLanguage): string {
    const key = confidence === 'high' ? 'ankiMappingHighConfidence' : confidence === 'medium' ? 'ankiMappingMediumConfidence' : 'ankiMappingLowConfidence';
    return `<span class="jpdb-reader-anki-confidence" data-confidence="${confidence}">${escapedUiText(language, key)}</span>`;
}

function ankiFieldMappingRoleLabel(role: AnkiFieldMappingRole, language: InterfaceLanguage): string {
    return {
        expression: uiText(language, 'ankiRoleExpression'),
        reading: uiText(language, 'ankiRoleReading'),
        meaning: uiText(language, 'ankiRoleMeaning'),
        sentence: uiText(language, 'ankiRoleSentence'),
        audio: uiText(language, 'ankiRoleAudio'),
        image: uiText(language, 'ankiRoleImage'),
    }[role];
}

export function renderDeckControls(settings: ReaderSettings, decks: JPDBDeck[], hasApiKey: boolean, language: InterfaceLanguage = settings.interfaceLanguage): string {
    const disabled = !hasApiKey || !decks.length;
    const deckOptions = decks.map(deck => [deck.id, deck.name] as [string, string]);
    const miningOptions = [['forq', 'FORQ'], ...deckOptions] as [string, string][];
    const newTabOptions = [['all', 'All study decks'], ['never-forget', 'Never forget'], ...deckOptions] as [string, string][];
    return `
        <div class="grid">
            ${deckSelect('miningDeck', 'Mining deck', settings.miningDeck, miningOptions, disabled, language)}
            ${checkbox('autoMineOnReview', 'Add reviewed words to the mining deck automatically', settings.autoMineOnReview)}
            ${deckSelect('newTabJpdbDeck', 'New tab JPDB deck', settings.newTabJpdbDeck, newTabOptions, disabled, language)}
            ${deckSelect('neverForgetDeck', 'Never forget deck', settings.neverForgetDeck, deckOptions, disabled, language)}
            ${deckSelect('blacklistDeck', 'Blacklist deck', settings.blacklistDeck, deckOptions, disabled, language)}
        </div>
        <div class="jpdb-reader-help">${hasApiKey ? (decks.length ? 'Decks are loaded from your JPDB account.' : 'Could not load decks yet; saved deck IDs will be kept.') : 'Add your JPDB API key to choose decks.'}</div>
    `;
}

function deckSelect(name: string, label: string, value: string, options: [string, string][], disabled: boolean, language: InterfaceLanguage): string {
    const hasValue = options.some(([optionValue]) => optionValue === value);
    const savedLabel = uiText(language, 'savedValue').replace('{value}', value);
    const merged = hasValue || !value ? options : [[value, savedLabel] as [string, string], ...options];
    return `<label>${label}
        <select name="${name}" ${disabled ? 'disabled' : ''}>
            ${merged.map(([optionValue, text]) => `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
        </select>
        ${disabled ? `<input type="hidden" name="${name}" value="${escapeHtml(value)}">` : ''}
    </label>`;
}

export function renderAnkiTemplatePreview(settings: ReaderSettings): string {
    const contextMode = settings.ankiTemplateMode === 'context';
    const front = contextMode
        ? `${settings.ankiFrontImage ? '<small>Image appears above the prompt when available.</small>' : ''}<div class="jpdb-reader-template-sentence">今日は<span>本を読む</span>。</div><small>Recall the highlighted word from context.</small>`
        : [
            '<div class="jpdb-reader-template-expression">読む</div>',
            settings.ankiFrontReading ? '<div class="jpdb-reader-template-reading">よむ</div>' : '',
            settings.ankiFrontSentence ? '<div class="jpdb-reader-template-sentence">今日は<span>本を読む</span>。</div>' : '',
            settings.ankiFrontImage ? '<small>Image appears on the front when available.</small>' : '',
            '<small>Recall the meaning first.</small>',
        ].filter(Boolean).join('');
    return `
        <div class="jpdb-reader-template-preview">
            <div class="jpdb-reader-template-preview-title">${contextMode ? 'Sentence first preset' : 'Word first preset'}</div>
            <div class="jpdb-reader-template-preview-grid">
                <div>
                    <strong>Front</strong>
                    ${front}
                </div>
                <div>
                    <strong>Back</strong>
                    <div class="jpdb-reader-template-expression">読む</div>
                    <div class="jpdb-reader-template-reading">よむ</div>
                    <div class="jpdb-reader-template-meaning">to read</div>
                    <small>Includes dictionary, kanji, pitch, frequency, source, and image fields when available.</small>
                </div>
            </div>
        </div>
    `;
}
