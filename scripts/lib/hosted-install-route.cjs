// The one place that decides which install a visitor is offered.
//
// Yomu ships three ways, and only one of them is right for any given visitor:
// a Chrome Web Store extension, a Firefox Add-ons extension, and the userscript
// that needs a manager installed first. The site used to offer only the
// userscript, so every store-capable visitor was sent down the path with the
// extra prerequisite — the single most common reason an install stalls.
//
// The rules are ordered and the first match wins. They are deliberately shaped
// around what each browser can actually *install*, not around what it is
// called:
//   - iOS wrappers (FxiOS, CriOS, EdgiOS, OPiOS) are Safari underneath. Neither
//     store can serve them whatever the brand in the UA says, so they take the
//     userscript path with the Userscripts app.
//   - Firefox is tested before Android because the AMO listing declares Android
//     142+ support (verified against the AMO API), so Firefox for Android is a
//     real store install.
//   - Android is then excluded because Chromium on Android has no extension
//     support at all.
//   - Everything else Chromium-shaped (Chrome, Edge, Brave, Opera, Chromium)
//     installs from the Chrome Web Store.
// Safari, iPadOS, and anything unrecognised fall through to the userscript,
// which is genuinely the only build that exists for them.
//
// Detection is a convenience, never a gate: every route is a real link in the
// page at every moment, so a wrong guess costs a visitor one glance, not the
// install.

const INSTALL_ROUTE_URLS = Object.freeze({
    chrome: 'https://chromewebstore.google.com/detail/%E3%82%88%E3%82%80/bbaickgfdgnecdnkcplaoiopnfghlkna',
    firefox: 'https://addons.mozilla.org/en-US/firefox/addon/yomu-reader/',
    userscript: 'https://yomureader.com/yomu.user.js',
});

const INSTALL_ROUTE_RULES = Object.freeze([
    ['userscript', 'FxiOS|CriOS|EdgiOS|OPiOS'],
    ['firefox', 'Firefox/'],
    ['userscript', 'Android'],
    ['chrome', 'Edg/|Chrome/|Chromium/'],
]);

const DEFAULT_INSTALL_ROUTE = 'userscript';

/**
 * @param {string} userAgent
 * @returns {'chrome' | 'firefox' | 'userscript'}
 */
function resolveHostedInstallRoute(userAgent) {
    const ua = typeof userAgent === 'string' ? userAgent : '';
    for (const [route, pattern] of INSTALL_ROUTE_RULES) {
        if (new RegExp(pattern).test(ua)) return route;
    }
    return DEFAULT_INSTALL_ROUTE;
}

/**
 * Inline <head> snippet that stamps the resolved route on <html> before the
 * first paint, so the promoted button is already the right one when the fold
 * appears rather than swapping under the visitor's eyes. It builds its rules
 * from the same table as resolveHostedInstallRoute, so the shipped page and the
 * tested function can never disagree.
 *
 * The snippet never removes an attribute and never writes anything except
 * data-yomu-install; if it throws, the page keeps the no-JS default, which is
 * the userscript — the route that works everywhere.
 *
 * @returns {string} minified IIFE, safe to inline inside a <script> element.
 */
function hostedInstallRouteSnippet() {
    const rules = JSON.stringify(INSTALL_ROUTE_RULES);
    const fallback = JSON.stringify(DEFAULT_INSTALL_ROUTE);
    const code =
        '(function(){try{' +
        'var u=(navigator&&navigator.userAgent)||"";' +
        `var r=${rules},m=${fallback};` +
        'for(var i=0;i<r.length;i++){if(new RegExp(r[i][1]).test(u)){m=r[i][0];break}}' +
        'document.documentElement.setAttribute("data-yomu-install",m)' +
        '}catch(e){}})()';
    // Inline scripts end at the first `</script>`; nothing here has any business
    // producing one, but never let a future URL or rule break every hosted page.
    if (code.includes('</script')) throw new Error('Install route snippet must not contain a script end tag');
    return code;
}

module.exports = {
    DEFAULT_INSTALL_ROUTE,
    INSTALL_ROUTE_RULES,
    INSTALL_ROUTE_URLS,
    hostedInstallRouteSnippet,
    resolveHostedInstallRoute,
};
