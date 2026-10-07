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

// よむ Desktop downloads. The release workflow attaches version-less copies of
// each package (release-gaming.yml, "Add stable download names"), so these
// links always fetch the newest release's file directly.
const DESKTOP_DOWNLOAD_BASE = 'https://github.com/HRussellZFAC023/yomu-reader/releases/latest/download/';
const DESKTOP_DOWNLOAD_URLS = Object.freeze({
    'mac-arm64': `${DESKTOP_DOWNLOAD_BASE}yomu-desktop-mac-arm64.zip`,
    'mac-x64': `${DESKTOP_DOWNLOAD_BASE}yomu-desktop-mac-x64.zip`,
    'win-x64': `${DESKTOP_DOWNLOAD_BASE}yomu-desktop-win-x64.exe`,
    'linux-x86_64': `${DESKTOP_DOWNLOAD_BASE}yomu-desktop-linux-x86_64.AppImage`,
});

// Phones and tablets first: iPadOS Safari sends a Mac user agent, so a Mac with
// a touch screen is an iPad (the snippet checks maxTouchPoints). Macs default to
// Apple silicon, which every Mac sold since 2020 uses; Chromium can say "x86"
// through userAgentData, and Intel stays one click away in the list.
const DESKTOP_ROUTE_RULES = Object.freeze([
    ['none', 'iPhone|iPad|iPod|Android|CrOS'],
    ['win-x64', 'Windows'],
    ['mac-arm64', 'Macintosh|Mac OS X'],
    ['linux-x86_64', 'Linux|X11'],
]);

const DEFAULT_DESKTOP_ROUTE = 'none';

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
 * @param {string} userAgent
 * @param {number} [maxTouchPoints]
 * @returns {'mac-arm64' | 'mac-x64' | 'win-x64' | 'linux-x86_64' | 'none'}
 */
function resolveHostedDesktopRoute(userAgent, maxTouchPoints = 0) {
    const ua = typeof userAgent === 'string' ? userAgent : '';
    for (const [route, pattern] of DESKTOP_ROUTE_RULES) {
        if (!new RegExp(pattern).test(ua)) continue;
        return route === 'mac-arm64' && maxTouchPoints > 1 ? 'none' : route;
    }
    return DEFAULT_DESKTOP_ROUTE;
}

/**
 * Inline <head> snippet that stamps the resolved route on <html> before the
 * first paint, so the promoted button is already the right one when the fold
 * appears rather than swapping under the visitor's eyes. It builds its rules
 * from the same table as resolveHostedInstallRoute, so the shipped page and the
 * tested function can never disagree.
 *
 * It also stamps data-yomu-desktop with the よむ Desktop file for this
 * computer, so the download button fetches that file directly. Chromium on an
 * Intel Mac reports "x86" through userAgentData a moment later; the attribute
 * is corrected then, before anyone can reach the button.
 *
 * The snippet never removes an attribute and never writes anything except
 * those two; if it throws, the page keeps the no-JS defaults: the userscript
 * route, which works everywhere, and a link to the よむ Desktop page.
 *
 * @returns {string} minified IIFE, safe to inline inside a <script> element.
 */
function hostedInstallRouteSnippet() {
    const rules = JSON.stringify(INSTALL_ROUTE_RULES);
    const fallback = JSON.stringify(DEFAULT_INSTALL_ROUTE);
    const desktopRules = JSON.stringify(DESKTOP_ROUTE_RULES);
    const desktopFallback = JSON.stringify(DEFAULT_DESKTOP_ROUTE);
    const code =
        '(function(){try{' +
        'var n=navigator||{},u=n.userAgent||"",h=document.documentElement;' +
        `var r=${rules},m=${fallback};` +
        'for(var i=0;i<r.length;i++){if(new RegExp(r[i][1]).test(u)){m=r[i][0];break}}' +
        'h.setAttribute("data-yomu-install",m);' +
        `var q=${desktopRules},d=${desktopFallback};` +
        'for(var j=0;j<q.length;j++){if(new RegExp(q[j][1]).test(u)){d=q[j][0];break}}' +
        'if(d==="mac-arm64"&&(n.maxTouchPoints||0)>1)d="none";' +
        'h.setAttribute("data-yomu-desktop",d);' +
        'if(d==="mac-arm64"&&n.userAgentData&&n.userAgentData.getHighEntropyValues)' +
        'n.userAgentData.getHighEntropyValues(["architecture"]).then(function(v){' +
        'if(v&&v.architecture==="x86")h.setAttribute("data-yomu-desktop","mac-x64")},function(){})' +
        '}catch(e){}})()';
    // Inline scripts end at the first `</script>`; nothing here has any business
    // producing one, but never let a future URL or rule break every hosted page.
    if (code.includes('</script')) throw new Error('Install route snippet must not contain a script end tag');
    return code;
}

module.exports = {
    DEFAULT_DESKTOP_ROUTE,
    DEFAULT_INSTALL_ROUTE,
    DESKTOP_DOWNLOAD_URLS,
    DESKTOP_ROUTE_RULES,
    INSTALL_ROUTE_RULES,
    INSTALL_ROUTE_URLS,
    hostedInstallRouteSnippet,
    resolveHostedDesktopRoute,
    resolveHostedInstallRoute,
};
