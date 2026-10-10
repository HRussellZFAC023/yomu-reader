import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { checkbox } from './form-controls';
import { settingsText } from './settings-text';
import type { ReaderSettings } from '../app/types';

/**
 * The YouTube/media settings panel.
 *
 * Each group keeps its own `*SettingsPresent` marker: without one, a missing
 * checkbox reads back as a deliberate uncheck and silently turns the setting off
 * (see `readYoutubeFormSettings`).
 */
export function renderYoutubeSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    const immersionEnabled = settings.youtubeImmersionEnabled;
    return `
            <fieldset id="jpdb-reader-settings-panel-youtube" role="tabpanel" data-settings-panel="media" data-legend-key="youTube" aria-describedby="settings-help-youtube" hidden>
                <legend>${escapeHtml(uiText(language, 'youTube'))}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    <div data-language-family="youtube-immersion">
                        <input type="hidden" name="youtubeImmersionSettingsPresent" value="on">
                        <input type="hidden" name="youtubeImmersionEnabledInitial" value="${immersionEnabled ? 'on' : 'off'}">
                        ${checkbox('youtubeImmersionEnabled', text('youtubeImmersionEnabled'), immersionEnabled)}
                    </div>
                    <div data-language-family="youtube-channel-suggestions">
                        <input type="hidden" name="youtubeChannelSuggestionSettingsPresent" value="on">
                        ${checkbox('youtubeShowChannelRecommendations', text('youtubeShowChannelRecommendations'), settings.youtubeShowChannelRecommendations)}
                    </div>
                </div>
                <div id="settings-help-youtube" class="jpdb-reader-help" data-youtube-help>${text('youtubeHelp')}</div>
            </fieldset>
    `;
}
