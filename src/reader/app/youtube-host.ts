const YOUTUBE_APP_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'studio.youtube.com',
    'kids.youtube.com',
    'gaming.youtube.com',
    'youtu.be',
]);

/** Hosts that render a YouTube application UI, rather than an ordinary page
 * merely served below youtube.com (for example consent.youtube.com). */
export function isYouTubeAppHostname(hostname: string = location.hostname): boolean {
    return YOUTUBE_APP_HOSTS.has(hostname.toLowerCase());
}
