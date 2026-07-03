import { SubtitlePlayerController } from '../subtitles/controller';
import { YoutubeImmersionFilter } from '../subtitles/youtube';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('video', {
    SubtitlePlayerController,
    YoutubeImmersionFilter,
});
