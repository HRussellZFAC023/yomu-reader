import { Config } from '@remotion/cli/config';

// Feature clips are watched on phones at small sizes, so favour a clean 1080p
// H.264 that every social surface re-encodes without smearing the hairline
// keylines this design leans on.
//
// PNG intermediates rather than JPEG: the design is flat colour and hard edges,
// which is exactly what JPEG rings around, and it keeps the encoder input in a
// studio-range colour space so the master is not tagged yuvj420p (full range)
// and shown washed out by players that honour the tag.
Config.setVideoImageFormat('png');
Config.setCodec('h264');
Config.setCrf(17);
Config.setPixelFormat('yuv420p');
Config.setChromiumOpenGlRenderer('angle');
Config.setOverwriteOutput(true);
