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
//   - Every other Android browser gets its own route, which promotes Firefox:
//     Chrome on Android installs no extensions, and the Safari steps the
//     userscript route opens mean nothing there.
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
    ['android', 'Android'],
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

// iPadOS can send a Mac user agent. A non-touch Mac still has unknown CPU
// architecture until Client Hints supplies it; Safari's "Intel" UA is not proof.
const DESKTOP_ROUTE_RULES = Object.freeze([
    ['none', 'iPhone|iPad|iPod|Android|CrOS'],
    ['win-x64', 'Windows'],
    ['mac', 'Macintosh|Mac OS X'],
    ['linux-x86_64', 'Linux|X11'],
]);

const DEFAULT_DESKTOP_ROUTE = 'none';

/**
 * @param {string} userAgent
 * @returns {'chrome' | 'firefox' | 'android' | 'userscript'}
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
 * @param {string} [architecture] explicit User-Agent Client Hint
 * @returns {'mac-arm64' | 'mac-x64' | 'win-x64' | 'linux-x86_64' | 'none'}
 */
function resolveHostedDesktopRoute(userAgent, maxTouchPoints = 0, architecture = '') {
    const ua = typeof userAgent === 'string' ? userAgent : '';
    for (const [route, pattern] of DESKTOP_ROUTE_RULES) {
        if (!new RegExp(pattern).test(ua)) continue;
        if (route !== 'mac') return route;
        if (maxTouchPoints > 1) return 'none';
        return architecture === 'arm' ? 'mac-arm64' : architecture === 'x86' ? 'mac-x64' : 'none';
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
 * Unknown Macs use the existing Desktop choice page, which offers labelled
 * Apple silicon and Intel links. Only an explicit architecture hint promotes
 * a direct binary, including while an asynchronous hint is still pending.
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
        'var mac=d==="mac"&&(n.maxTouchPoints||0)<=1;if(d==="mac")d="none";' +
        'h.setAttribute("data-yomu-desktop",d);' +
        'if(mac&&n.userAgentData&&n.userAgentData.getHighEntropyValues)' +
        'n.userAgentData.getHighEntropyValues(["architecture"]).then(function(v){' +
        'if(v&&(v.architecture==="arm"||v.architecture==="x86"))h.setAttribute("data-yomu-desktop",v.architecture==="arm"?"mac-arm64":"mac-x64")},function(){})' +
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
