import { SubtitlePlayerController } from '../subtitles/controller';
import { YoutubeImmersionFilter } from '../subtitles/youtube';
import {
    applyPreferredJapaneseSiteLanguage,
    installPreferredJapaneseSiteLanguageFromStoredSettings,
    preferredJapaneseSiteUrl,
} from '../app/preferred-site-language-impl';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('video', {
    SubtitlePlayerController,
    YoutubeImmersionFilter,
    installPreferredJapaneseSiteLanguageFromStoredSettings,
    applyPreferredJapaneseSiteLanguage,
    preferredJapaneseSiteUrl,
});
