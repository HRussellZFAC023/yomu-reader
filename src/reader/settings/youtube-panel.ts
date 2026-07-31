import { escapeHtml } from '../dom/index';
import { uiText } from '../app/i18n';
import { checkbox } from './form-controls';
import { settingsText } from './settings-text';
import type { ReaderSettings } from '../app/types';

/**
 * The YouTube/media settings panel.
 *
 * Gating here follows the DATA behind each control, not whether its label mentions
 * Japanese:
 *
 * - The **immersion filter** and its notice ask the ACTIVE target whether text is its
 *   language (A48), so every learner gets them. They were `jp-only` DETACHED, which
 *   meant 31 of 32 targets could not reach a feature that already worked for them.
 * - The **site-language redirect** threads the active target too
 *   (`app/preferred-site-language-impl.ts`), so it is offered to every learner.
 * - The **channel suggestions** stay Japanese-only, because their corpus is 100
 *   Japanese channels graded N5..N1 and there is no equivalent list for any other
 *   language. Recommending the wrong language is worse than recommending nothing.
 *
 * Each separately-gated group needs its OWN `*SettingsPresent` marker: without one, a
 * detached checkbox reads back as a deliberate uncheck and silently turns the setting
 * off (see `readYoutubeFormSettings`).
 */
export function renderYoutubeSettingsPanel(settings: ReaderSettings): string {
    const language = settings.interfaceLanguage;
    const text = settingsText(language);
    return `
            <fieldset id="jpdb-reader-settings-panel-youtube" role="tabpanel" data-settings-panel="media" data-legend-key="youTube" aria-describedby="settings-help-youtube" hidden>
                <legend>${escapeHtml(uiText(language, 'youTube'))}</legend>
                <div class="grid jpdb-reader-settings-tgrid">
                    <div data-language-family="youtube-immersion">
                        <input type="hidden" name="youtubeImmersionSettingsPresent" value="on">
                        ${checkbox('youtubeImmersionEnabled', text('youtubeImmersionEnabled'), settings.youtubeImmersionEnabled)}
                        ${checkbox('youtubeShowFilterNotice', text('youtubeShowFilterNotice'), settings.youtubeShowFilterNotice)}
                    </div>
                    <div class="jp-only" data-language-family="youtube-channel-suggestions">
                        <input type="hidden" name="youtubeChannelSuggestionSettingsPresent" value="on">
                        ${checkbox('youtubeShowChannelRecommendations', text('youtubeShowChannelRecommendations'), settings.youtubeShowChannelRecommendations)}
                    </div>
                    <div data-language-family="preferred-target-sites">
                        <input type="hidden" name="preferJapaneseSiteLanguageSettingPresent" value="on">
                        ${checkbox('preferJapaneseSiteLanguage', text('preferJapaneseSiteLanguage'), settings.preferJapaneseSiteLanguage)}
                    </div>
                </div>
                <div id="settings-help-youtube" class="jpdb-reader-help" data-youtube-help>${text('youtubeHelp')}</div>
            </fieldset>
    `;
}
