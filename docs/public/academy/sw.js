const VERSION = 'yomu-academy-shell-s1-5cadead672c0';
const CORE = [
    '/yomu.user.js',
    '/yomu.css',
    '/greasyfork/yomu-ui-copy.user.js',
    '/greasyfork/yomu-settings-surface.user.js',
    '/greasyfork/yomu-kanji-study.user.js',
    '/greasyfork/yomu-anki.user.js',
    '/yomu-icon.svg',
    '/academy/',
    '/academy/index.html',
    '/academy/app.js?v=s1-5cadead672c0',
    '/academy/style.css?v=s1-5cadead672c0',
    '/academy/manifest.webmanifest',
    '/academy/art/characters/rie/rie__neutral__halfbody__v001.png',
    '/academy/art/characters/rie/rie__happy__halfbody__v001.png',
    '/academy/art/characters/rie/rie__encouraging__halfbody__v001.png',
    '/academy/art/characters/rie/rie__repair__halfbody__v001.png',
    '/academy/art/characters/aakash/aakash__neutral__halfbody__v001.png',
    '/academy/art/characters/shaun/shaun__neutral__halfbody__v001.png',
    '/academy/art/protagonists/quality-2__picker__v001.png',
    '/academy/art/protagonists/quality-3__picker__v001.png',
    '/academy/art/protagonists/quality-4__picker__v001.png',
    '/academy/art/protagonists/quality-5__picker__v001.png',
    '/academy/art/locations/wide/campus-home__ensemble-spring--wide.webp',
    '/academy/art/locations/wide/campus-entrance__blue-hour-arrival--wide.webp',
    '/academy/art/locations/mobile/campus-entrance__blue-hour-arrival--mobile.webp',
    '/academy/art/locations/wide/classroom__evening-lamplit--wide.webp',
    '/academy/art/locations/mobile/classroom__evening-lamplit--mobile.webp',
    '/academy/art/locations/wide/library__rain-evening--wide.webp',
    '/academy/art/locations/mobile/library__rain-evening--mobile.webp',
    '/academy/art/locations/wide/cafe__night-rain--wide.webp',
    '/academy/art/locations/mobile/cafe__night-rain--mobile.webp',
    '/academy/art/locations/wide/language-lab__evening-listening--wide.webp',
    '/academy/art/locations/mobile/language-lab__evening-listening--mobile.webp',
    '/academy/art/locations/wide/writing-studio__rain-night--wide.webp',
    '/academy/art/locations/mobile/writing-studio__rain-night--mobile.webp',
    '/academy/art/events/rainy-directions__rie-aakash__v001.png',
    '/academy/content/vertical-slice/source-library.v1.json',
    '/academy/content/vertical-slice/augmentation.v1.json',
    '/academy/content/lessons/lesson-zero.v1.json',
    '/academy/vendor/kanjivg/04e00.svg',
    '/academy/vendor/kanjivg/ATTRIBUTION.md',
    '/academy/vendor/kanjivg/LICENSE.txt',
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(key => key.startsWith('yomu-academy-') && key !== VERSION).map(key => caches.delete(key))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    const isReaderRuntime = url.pathname === '/yomu.user.js'
        || url.pathname === '/yomu.css'
        || url.pathname === '/greasyfork/yomu-ui-copy.user.js'
        || url.pathname === '/greasyfork/yomu-settings-surface.user.js'
        || url.pathname === '/greasyfork/yomu-kanji-study.user.js'
        || url.pathname === '/greasyfork/yomu-anki.user.js';
    if (url.origin !== self.location.origin || (!url.pathname.startsWith('/academy/') && !isReaderRuntime)) return;
    // Authentication and byte-range semantics stay with the Worker/R2
    // boundary. Generic shell caching must never persist protected media.
    if (url.pathname.startsWith('/academy/api/') || url.pathname.startsWith('/academy/media/')) return;
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).then(response => {
            if (!response.ok) return response;
            const copy = response.clone();
            event.waitUntil(caches.open(VERSION).then(cache => cache.put('/academy/index.html', copy)));
            return response;
        }).catch(async () => await caches.match('/academy/index.html')
            ?? new Response('よむ Academy is not available offline yet.', { status: 503 })));
        return;
    }
    event.respondWith(caches.match(request).then(cached => cached ?? fetch(request).then(response => {
        if (!response.ok) return response;
        const copy = response.clone();
        event.waitUntil(caches.open(VERSION).then(cache => cache.put(request, copy)));
        return response;
    })));
});
