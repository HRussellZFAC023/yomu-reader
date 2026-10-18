// Recording side of the YouTube host adapter: bring a live watch page to a
// still, captions-on state and keep what the mechanism fixture replays — the
// player response's caption track list and the json3 tracks (Japanese ASR and
// its tlang=en translation) — with every text redacted and only timings kept.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { rejectConsent } from './recording-targets.mjs';
import { normalizeTextRun } from './recorded-redaction.mjs';
import { asrCaptionTracksMechanismFixture } from './youtube-caption-mechanism-fixture.mjs';

const KEPT_TIMEDTEXT_PARAMS = ['v', 'lang', 'kind', 'caps', 'xoaf', 'hl'];

// In-page steps on YouTube's own player. They throw if YouTube renames a
// method, which is what a recorder should do when the site changes.
const PLAYER_STEPS = {
    // The player asks for its caption track only once it plays.
    captionsOn: () => {
        const player = document.querySelector('#movie_player');
        player.querySelector('video').muted = true;
        player.loadModule('captions');
        player.setOption('captions', 'track', { languageCode: 'ja' });
        player.playVideo();
    },
    // The translated track has to come from the player too: it signs its own requests.
    translationOn: () => {
        const player = document.querySelector('#movie_player');
        player.setOption('captions', 'track', { languageCode: 'ja', kind: 'asr', translationLanguage: { languageCode: 'en', languageName: 'English' } });
        player.playVideo();
    },
    stillAtStart: () => {
        const player = document.querySelector('#movie_player');
        player.pauseVideo();
        player.setOption('captions', 'track', { languageCode: 'ja' });
        player.seekTo(0, true);
    },
    playerResponse: () => document.querySelector('#movie_player').getPlayerResponse(),
};

const isTimedText = response => new URL(response.url()).pathname === '/api/timedtext';
const isTranslated = response => new URL(response.url()).searchParams.get('tlang') === 'en';

async function waitForResponse(page, observed, matches) {
    for (let waited = 0; waited < 15_000; waited += 250) {
        const found = observed.find(matches);
        if (found) return found;
        await page.waitForTimeout(250);
    }
    return null;
}

/**
 * observed: every response the page has had since navigation (the player may
 * ask for captions at once). captionsFrom: a folder holding ja.json3 and
 * ja.tlang-en.json3 saved from this video elsewhere, for a network where
 * YouTube refuses the player's own caption requests (429 "automated queries").
 * captionTimings: 'mechanism-fixture' when neither is possible (see captionTracks).
 */
export async function prepareYouTubeWatch(page, observed, { captionsFrom, captionTimings, captionSeconds } = {}) {
    await rejectConsent(page);
    await page.locator('#movie_player video').first().waitFor({ state: 'attached', timeout: 30_000 });
    await page.waitForTimeout(3000);
    const json3 = await captionTracks(page, observed, { captionsFrom, captionTimings, captionSeconds });
    await page.evaluate(PLAYER_STEPS.stillAtStart);
    // YouTube raises its consent dialog over the player a few seconds in; it gets the same answer.
    await rejectConsent(page);
    const playerResponse = await page.evaluate(PLAYER_STEPS.playerResponse);
    requireCaptions(playerResponse, json3);
    return { playerResponse, json3 };
}

// captionTimings 'mechanism-fixture': YouTube refuses this network's caption
// requests, so the tracks are hand-made ASR-shaped timings, named and flagged
// as a Mechanism Fixture (youtube-caption-mechanism-fixture.mjs).
async function captionTracks(page, observed, { captionsFrom, captionTimings, captionSeconds }) {
    if (captionTimings === 'mechanism-fixture') return asrCaptionTracksMechanismFixture({ seconds: captionSeconds });
    if (captionTimings) throw new Error(`--caption-timings takes only mechanism-fixture, not ${captionTimings}`);
    return captionsFrom ? savedCaptionTracks(captionsFrom) : playerCaptionTracks(page, observed);
}

function requireCaptions(playerResponse, json3) {
    const found = { player: Boolean(playerResponse.captions), ja: Boolean(json3.ja), 'tlang=en': Boolean(json3.jaEn) };
    if (Object.values(found).includes(false)) throw new Error(`YouTube gave no usable captions (${JSON.stringify(found)}).`);
}

async function playerCaptionTracks(page, observed) {
    await page.evaluate(PLAYER_STEPS.captionsOn);
    const original = await waitForResponse(page, observed, response => isTimedText(response) && !isTranslated(response));
    await page.evaluate(PLAYER_STEPS.translationOn);
    const translated = await waitForResponse(page, observed, response => isTimedText(response) && isTranslated(response));
    return { ja: await responseJson(original), jaEn: await responseJson(translated) };
}

function savedCaptionTracks(dir) {
    const read = name => JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    return { ja: read('ja.json3'), jaEn: read('ja.tlang-en.json3') };
}

async function responseJson(response) {
    if (!response) return null;
    const format = new URL(response.url()).searchParams.get('fmt');
    if (format !== 'json3') throw new Error(`The player asked for fmt=${format}, not json3; teach the recorder that format.`);
    const body = response.status() === 200 ? await response.text() : '';
    // YouTube refuses with a 429, or with an empty 200 when the player's proof-of-origin token is not accepted.
    if (!body.trim()) throw new Error(`YouTube answered its own caption request with ${response.status()} and ${body.length ? 'a blank' : 'no'} body; record from another network later, or pass --captions-from.`);
    return JSON.parse(body);
}

const segmentTexts = event => {
    const segs = event.segs ?? [];
    return [segs.map(seg => seg.utf8 ?? '').join(''), ...segs.map(seg => seg.utf8)];
};

/** Original text runs of the captured host data, for the redaction hash list. */
export function youtubeHostOriginalRuns({ playerResponse, json3 }) {
    const details = playerResponse.videoDetails ?? {};
    const captions = [json3.ja, json3.jaEn].flatMap(track => (track.events ?? []).flatMap(segmentTexts));
    return [details.title, details.author, details.shortDescription, ...captions].filter(run => normalizeTextRun(run));
}

/**
 * The files the adapter replays, redacted: text through `redact`, timings,
 * windows and ASR confidence kept, events cut at captionSeconds.
 */
export function youtubeHostFiles({ playerResponse, json3 }, { redact, captionSeconds }) {
    const cutoff = captionSeconds * 1000;
    const suffix = json3.mechanismFixture ? '-mechanism-fixture' : '';
    const jaFile = `host/timedtext.ja${suffix}.json3`;
    const enFile = `host/timedtext.ja.tlang-en${suffix}.json3`;
    return {
        files: {
            'host/player.json': redactedPlayerResponse(playerResponse, { redact, captionSeconds }),
            [jaFile]: redactedTrack(json3.ja, { redact, cutoff }),
            [enFile]: redactedTrack(json3.jaEn, { redact, cutoff }),
        },
        manifestHost: {
            kind: 'youtube-player',
            player: 'host/player.json',
            captionsOn: true,
            ...(json3.mechanismFixture ? { captionTimings: 'mechanism-fixture' } : {}),
            tracks: [
                { lang: 'ja', file: jaFile },
                { lang: 'ja', tlang: 'en', file: enFile },
            ],
            clip: { webm: 'host/clip.webm', mp4: 'host/clip.mp4', seconds: captionSeconds },
        },
    };
}

function redactedTrack(track, { redact, cutoff }) {
    const segment = seg => ({ ...pick(seg, ['tOffsetMs', 'acAsrConf', 'pPenId']), utf8: seg.utf8 === '\n' ? '\n' : redact(seg.utf8 ?? '') });
    const event = item => ({
        ...pick(item, ['tStartMs', 'dDurationMs', 'id', 'wpWinPosId', 'wsWinStyleId', 'wWinId', 'aAppend']),
        ...(item.segs ? { segs: item.segs.map(segment) } : {}),
    });
    return {
        ...pick(track, ['wireMagic', 'pens', 'wsWinStyles', 'wpWinPositions']),
        events: (track.events ?? []).filter(item => (item.tStartMs ?? 0) < cutoff).map(event),
    };
}

// Track names are written here, not copied: the page's own language labels are redacted text.
function captionTrack(track) {
    return {
        baseUrl: sanitizedTimedTextUrl(track.baseUrl),
        name: { simpleText: `${track.languageCode}${track.kind === 'asr' ? ' (auto-generated)' : ''}` },
        vssId: track.vssId,
        languageCode: track.languageCode,
        ...(track.kind ? { kind: track.kind } : {}),
        isTranslatable: Boolean(track.isTranslatable),
    };
}

function redactedDetails({ videoId, title = '', author = '' }, { redact, captionSeconds }) {
    return { videoId, lengthSeconds: String(captionSeconds), title: redact(title), author: redact(author), isLiveContent: false };
}

function redactedPlayerResponse(playerResponse, { redact, captionSeconds }) {
    const tracks = playerResponse.captions.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    return {
        playabilityStatus: { status: 'OK' },
        videoDetails: redactedDetails(playerResponse.videoDetails ?? {}, { redact, captionSeconds }),
        captions: {
            playerCaptionsTracklistRenderer: {
                captionTracks: tracks.map(captionTrack),
                translationLanguages: [{ languageCode: 'en', languageName: { simpleText: 'en' } }],
                defaultAudioTrackIndex: 0,
                audioTracks: [{ captionTrackIndices: tracks.map((_, index) => index) }],
            },
        },
    };
}

/** A caption track URL without its signature, expiry, IP or session parameters. */
function sanitizedTimedTextUrl(raw) {
    const source = new URL(raw, 'https://www.youtube.com');
    const clean = new URL('https://www.youtube.com/api/timedtext');
    for (const name of KEPT_TIMEDTEXT_PARAMS.filter(param => source.searchParams.has(param))) clean.searchParams.set(name, source.searchParams.get(name));
    return clean.href;
}

function pick(object, names) {
    return Object.fromEntries(names.filter(name => object[name] !== undefined).map(name => [name, object[name]]));
}
