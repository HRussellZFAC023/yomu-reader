const siteOrigin = 'https://yomureader.com';
const indexNowKey = process.env.YOMU_INDEXNOW_KEY || '390e25af05bd53bec617fef925f88132';
const sitemapUrl = process.env.YOMU_SITEMAP_URL || `${siteOrigin}/sitemap.xml`;
const endpoint = process.env.YOMU_INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';

const keyLocation = `${siteOrigin}/${indexNowKey}.txt`;
const host = new URL(siteOrigin).hostname;

function decodeXmlText(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

async function fetchText(url) {
    const response = await fetch(url, { headers: { accept: 'application/xml,text/xml,text/plain,*/*' } });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

const sitemapXml = await fetchText(sitemapUrl);
const urlList = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(([, loc]) => decodeXmlText(loc.trim()))
    .filter(url => url.startsWith(`${siteOrigin}/`));

if (!urlList.length) {
    throw new Error(`No ${siteOrigin} URLs found in ${sitemapUrl}`);
}

const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
        host,
        key: indexNowKey,
        keyLocation,
        urlList,
    }),
});

if (!response.ok) {
    const body = await response.text();
    throw new Error(`IndexNow submit failed: ${response.status} ${response.statusText}\n${body}`);
}

console.log(`Submitted ${urlList.length} URLs to IndexNow via ${endpoint}`);
