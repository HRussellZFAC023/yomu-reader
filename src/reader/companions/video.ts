import { installCanvasMirrorRecorder } from '../ocr/canvas-mirror';
import { ImageOcrController } from '../ocr/controller';
import { SubtitlePlayerController } from '../subtitles/controller';
import { YoutubeImmersionFilter } from '../subtitles/youtube';
import { registerYomuCompanion } from './registry';

// Must run at document-start, before the BookWalker/NFBR viewer engine paints, so
// we record its descramble drawImage ops and can rebuild the tainted page canvas
// for OCR on Firefox/iPad. No-op off BookWalker hosts.
installCanvasMirrorRecorder();

registerYomuCompanion('video', {
    SubtitlePlayerController,
    YoutubeImmersionFilter,
});

registerYomuCompanion('ocr', {
    ImageOcrController,
});
