const VIDEO_FRAME_MAX_WIDTH = 960;
const VIDEO_FRAME_JPEG_QUALITY = 0.84;

/** Paint one decoded video frame into the shared, bounded JPEG representation. */
export function videoFrameDataUrl(video: HTMLVideoElement): string | undefined {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, VIDEO_FRAME_MAX_WIDTH / video.videoWidth);
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', VIDEO_FRAME_JPEG_QUALITY);
}
