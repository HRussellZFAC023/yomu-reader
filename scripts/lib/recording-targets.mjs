// What scripts/record-pages.mjs records, and how each live page is brought to
// the state a learner reads it in before it is frozen. Licence decides the
// content rule: 'verbatim' pages are public domain or CC and are committed as
// they are, with attribution; 'redacted' pages belong to their publishers and
// are committed only after text-redactor.mjs has replaced their text and
// pictures.

const CC_BY_SA_4 = 'CC BY-SA 4.0';
const PUBLIC_DOMAIN = 'Public domain';
const REDACTED = 'Redacted structure of a copyrighted page (text replaced with public-domain text, pictures blanked)';
const DESKTOP = { width: 1280, height: 900 };

export const RECORDING_TARGETS = Object.freeze([
    {
        slug: 'ja-wikipedia-nihongo',
        url: 'https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E',
        content: 'verbatim',
        licence: CC_BY_SA_4,
        attribution: 'Wikipedia contributors, 「日本語」, ウィキペディア日本語版. Text CC BY-SA 4.0; each image under the licence on its Wikimedia Commons file page.',
        viewport: DESKTOP,
        productTrafficHosts: ['api.jiten.moe'],
    },
    {
        slug: 'ja-wikipedia-tokyo',
        url: 'https://ja.wikipedia.org/wiki/%E6%9D%B1%E4%BA%AC%E9%83%BD',
        content: 'verbatim',
        licence: CC_BY_SA_4,
        attribution: 'Wikipedia contributors, 「東京都」, ウィキペディア日本語版. Text CC BY-SA 4.0; each image under the licence on its Wikimedia Commons file page.',
        viewport: DESKTOP,
        productTrafficHosts: ['api.jiten.moe'],
    },
    {
        slug: 'aozora-kokoro',
        url: 'https://www.aozora.gr.jp/cards/000148/files/773_14560.html',
        content: 'verbatim',
        licence: PUBLIC_DOMAIN,
        attribution: '夏目漱石『こころ』, 青空文庫 (Aozora Bunko) electronic text. The work is in the public domain; Aozora Bunko asks that its credit lines stay with the text, and they do (page footer).',
        viewport: DESKTOP,
    },
    {
        slug: 'aozora-wagahai',
        url: 'https://www.aozora.gr.jp/cards/000148/files/789_14547.html',
        content: 'verbatim',
        licence: PUBLIC_DOMAIN,
        attribution: '夏目漱石『吾輩は猫である』, 青空文庫 (Aozora Bunko) electronic text. Public domain; credit lines kept in the page footer.',
        viewport: DESKTOP,
    },
    {
        slug: 'commons-sign-photo',
        url: 'https://commons.wikimedia.org/wiki/File:%E3%81%A1%E3%81%8B%E3%82%93%E6%B3%A8%E6%84%8F%E3%80%81%E5%A4%A7%E5%B4%8E%E8%AD%A6%E5%AF%9F%E7%BD%B2%E3%81%AE%E7%9C%8B%E6%9D%BF.jpg',
        content: 'verbatim',
        licence: 'CC0 1.0 (photo); page text CC BY-SA 4.0',
        attribution: 'File:ちかん注意、大崎警察署の看板.jpg, Wikimedia Commons, released under CC0 1.0 by its author (see the file page). Page text: Wikimedia Commons contributors, CC BY-SA 4.0.',
        viewport: DESKTOP,
    },
    {
        slug: 'youtube-watch',
        url: 'https://www.youtube.com/watch?v=TAorfFcb8_g',
        content: 'redacted',
        licence: REDACTED,
        attribution: 'Structure and caption timings of a YouTube watch page (video TAorfFcb8_g), recorded for testing. No YouTube text, image, video or code is included.',
        viewport: DESKTOP,
        prepare: 'youtubeWatch',
        host: 'youtube-player',
        captionSeconds: 120,
    },
    {
        slug: 'youtube-search',
        url: 'https://www.youtube.com/results?search_query=%E6%97%A5%E6%9C%AC%E8%AA%9E+%E5%8B%89%E5%BC%B7',
        content: 'redacted',
        licence: REDACTED,
        attribution: 'Structure of a YouTube search results page, recorded for testing. No YouTube text, image or code is included.',
        viewport: DESKTOP,
    },
    {
        slug: 'note-top',
        url: 'https://note.com/',
        content: 'redacted',
        licence: REDACTED,
        attribution: 'Structure of the note.com top page, recorded for testing. No note.com text or image is included.',
        viewport: DESKTOP,
    },
    {
        slug: 'asahi-top',
        url: 'https://www.asahi.com/',
        content: 'redacted',
        licence: REDACTED,
        attribution: 'Structure of the asahi.com top page, recorded for testing. No Asahi Shimbun text or image is included.',
        viewport: DESKTOP,
    },
    {
        slug: 'ttsu-kokoro-vertical',
        startUrl: 'https://reader.ttsu.app/manage',
        url: 'https://reader.ttsu.app/b?id=1',
        content: 'verbatim',
        licence: 'App: BSD-3-Clause (ッツ Ebook Reader); text: public domain',
        attribution: 'ッツ Ebook Reader (reader.ttsu.app), Copyright (c) 2024, ッツ Reader Authors, BSD-3-Clause, showing 夏目漱石『こころ』 (public domain, from the aozora-kokoro recording) in its default vertical paged view.',
        viewport: DESKTOP,
        prepare: 'ttsuVertical',
        // The app's two Noto Serif JP files are 8 MB; replays use the system's Japanese serif.
        webFonts: false,
    },
    {
        slug: 'ttsu-kokoro-horizontal',
        startUrl: 'https://reader.ttsu.app/manage',
        url: 'https://reader.ttsu.app/b?id=1',
        content: 'verbatim',
        licence: 'App: BSD-3-Clause (ッツ Ebook Reader); text: public domain',
        attribution: 'ッツ Ebook Reader (reader.ttsu.app), Copyright (c) 2024, ッツ Reader Authors, BSD-3-Clause, showing 夏目漱石『こころ』 (public domain) with Writing Mode set to Horizontal, paged.',
        viewport: DESKTOP,
        prepare: 'ttsuHorizontal',
        webFonts: false,
    },
    {
        slug: 'piccoma-web',
        url: 'https://piccoma.com/web/',
        content: 'redacted',
        licence: REDACTED,
        attribution: 'Structure of the piccoma.com web store top page, recorded for testing. No Piccoma text or image is included.',
        viewport: DESKTOP,
    },
]);

export function recordingTarget(slug) {
    const target = RECORDING_TARGETS.find(candidate => candidate.slug === slug);
    if (!target) throw new Error(`Unknown recording target "${slug}". Known: ${RECORDING_TARGETS.map(candidate => candidate.slug).join(', ')}`);
    return target;
}

/** Consent walls get the privacy-preserving answer. */
export async function rejectConsent(page) {
    const labels = [/^Reject all$/iu, /すべて拒否/u, /^Reject$/iu, /^Decline$/iu, /同意しない/u];
    for (const label of labels) {
        const button = page.getByRole('button', { name: label }).first();
        if (await button.isVisible({ timeout: 500 }).catch(() => false)) {
            await button.click({ timeout: 2000 }).catch(() => undefined);
            await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
            await page.waitForTimeout(1000);
            return true;
        }
    }
    return false;
}

/** Scrolls the whole document once so lazy pictures and sections load, then returns to the top. */
export async function loadLazyContent(page, { maxScreens = 30, pauseMs = 250 } = {}) {
    const height = await page.evaluate(() => document.scrollingElement?.scrollHeight ?? 0);
    const viewport = page.viewportSize()?.height ?? 900;
    const screens = Math.min(maxScreens, Math.ceil(height / viewport));
    for (let screen = 1; screen <= screens; screen += 1) {
        await page.evaluate(top => window.scrollTo(0, top), screen * viewport);
        await page.waitForTimeout(pauseMs);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);
}
