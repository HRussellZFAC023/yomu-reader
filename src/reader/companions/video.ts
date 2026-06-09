import { ImageOcrController } from '../ocr/controller';
import { SubtitlePlayerController } from '../subtitles/controller';
import { YoutubeImmersionFilter } from '../subtitles/youtube';
import { registerYomuCompanion } from './registry';

registerYomuCompanion('video', {
    SubtitlePlayerController,
    YoutubeImmersionFilter,
});

registerYomuCompanion('ocr', {
    ImageOcrController,
});
