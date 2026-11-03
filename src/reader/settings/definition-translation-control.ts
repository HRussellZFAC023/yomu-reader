import { BUNPRO_DEFINITION_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, JPDB_DEFINITION_SOURCE_ID, WANIKANI_DEFINITION_SOURCE_ID } from '../app/constants';
import { uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import { escapeHtml } from '../dom';
import { activeLanguageProfile } from '../languages/profiles';
import { definitionSourceRows } from '../sources/sections';

const PUBLIC_PROVIDERS = new Set([JPDB_DEFINITION_SOURCE_ID, JITEN_DEFINITION_SOURCE_ID, BUNPRO_DEFINITION_SOURCE_ID, WANIKANI_DEFINITION_SOURCE_ID]);

export function renderDefinitionTranslationControls(settings: ReaderSettings): string {
    const enabled = new Set(activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId)?.definitionTranslationProviderIds ?? []);
    const sources = definitionSourceRows(settings).filter(row => PUBLIC_PROVIDERS.has(row.id) || row.removable && row.dictionaryType !== 'frequency');
    const visible = new Set(sources.map(source => source.id));
    return `<details class="jpdb-reader-settings-subsection" data-definition-translation-controls>
        <summary data-help-key="definitionTranslationTitle">${escapeHtml(uiText(settings.interfaceLanguage, 'definitionTranslationTitle'))}</summary>
        <div class="jpdb-reader-help" data-help-key="definitionTranslationHelp">${escapeHtml(uiText(settings.interfaceLanguage, 'definitionTranslationHelp'))}</div>
        <input type="hidden" name="definitionTranslationControlsPresent" value="1">
        ${[...enabled].filter(id => !visible.has(id)).map(id => `<input type="hidden" name="definitionTranslationProviderIds" value="${escapeHtml(id)}">`).join('')}
        <div class="jpdb-reader-definition-translation-list">
            ${sources.map(source => `<label class="inline"><input type="checkbox" name="definitionTranslationProviderIds" value="${escapeHtml(source.id)}" ${enabled.has(source.id) ? 'checked' : ''}><span>${escapeHtml(source.alias || source.name)}</span></label>`).join('')}
        </div>
    </details>`;
}
