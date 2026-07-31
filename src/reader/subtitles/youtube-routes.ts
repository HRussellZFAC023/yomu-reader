/**
 * Which YouTube page we are on, by pathname alone.
 *
 * These four predicates were spread through youtube.ts, a 2,700-line controller
 * that the file-size ratchet flags as one of the files every change ripples
 * through. They read nothing but `location.pathname`, so they belong outside it.
 */

export function isYouTubeHomePage(): boolean {
    return location.pathname === '/' || location.pathname === '/feed/explore';
}

export function isYouTubeWatchPage(): boolean {
    return location.pathname === '/watch';
}

export function isYouTubeShortsWatchPage(): boolean {
    return location.pathname.startsWith('/shorts/');
}

/**
 * The channel shelf is a browsing aid, so it belongs on the surfaces where
 * someone is choosing what to watch — never on top of the thing they already
 * chose.
 */
export function shouldShowChannelRecommendationsForRoute(): boolean {
    if (isYouTubeWatchPage()) return false;
    if (isYouTubeShortsWatchPage()) return false;
    return isYouTubeHomePage()
        || location.pathname === '/results'
        || location.pathname.startsWith('/feed/subscriptions');
}
