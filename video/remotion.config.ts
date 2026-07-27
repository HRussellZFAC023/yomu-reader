import { Config } from '@remotion/cli/config';

// Feature clips are watched on phones at small sizes, so favour a clean 1080p
// H.264 that every social surface re-encodes without smearing the hairline
// keylines this design leans on.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(17);
Config.setPixelFormat('yuv420p');
Config.setChromiumOpenGlRenderer('angle');
Config.setOverwriteOutput(true);
