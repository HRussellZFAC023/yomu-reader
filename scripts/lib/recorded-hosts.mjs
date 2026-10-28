// Host Adapters for Recorded Pages. A recording is a frozen DOM: the site's own
// scripts are gone, so anything the site DOES while a learner reads has to be
// put back by a small, hand-written mechanism fixture. Only YouTube needs one
// today — its player plays a video, exposes the movie_player API the product
// calls, answers /api/timedtext and draws its own captions in
// .ytp-caption-window-container. Everything else replays as a still page.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOSTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'recorded', 'hosts');
const CLIP_PATH = '/__yomu-recorded/clip';
const CORS = { 'access-control-allow-origin': '*' };

const STILL_PAGE = Object.freeze({
    documentHtml: html => html,
    answer: async () => null,
});

const ADAPTERS = {
    'youtube-player': (recording, host, options) => youtubePlayerHost(recording, host, options),
};

export function recordedHostAdapter(recording, options = {}) {
    const host = recording.manifest.host;
    if (!host) return STILL_PAGE;
    const adapter = ADAPTERS[host.kind];
    if (!adapter) throw new Error(`Recorded page ${recording.slug} names an unknown host adapter: ${host.kind}`);
    return adapter(recording, host, options);
}

const CLIPS = {
    webkit: { key: 'mp4', type: 'video/mp4' },
    default: { key: 'webm', type: 'video/webm' },
};

function clipFor(engine, host) {
    const clip = CLIPS[engine] ?? CLIPS.default;
    return { file: host.clip[clip.key], type: clip.type, extension: clip.key };
}

/** hostOptions: { captions (YouTube CC on, default as recorded), autoplay (true), startSeconds (0) }. */
function playerConfig(recording, host, options, { tracks, clip, read }) {
    const defaults = { captions: host.captionsOn ?? true, autoplay: true, startSeconds: 0 };
    const chosen = Object.fromEntries(Object.entries(defaults).map(([name, value]) => [name, options[name] ?? value]));
    return {
        player: JSON.parse(read(host.player).toString('utf8')),
        nativeTrack: tracks.find(track => !track.tlang)?.json3 ?? null,
        clipUrl: `${new URL(recording.manifest.url).origin}${CLIP_PATH}.${clip.extension}`,
        ...chosen,
    };
}

function youtubePlayerHost(recording, host, options) {
    const read = file => readFileSync(path.join(recording.dir, file));
    const tracks = host.tracks.map(track => ({ ...track, json3: JSON.parse(read(track.file).toString('utf8')) }));
    const clip = clipFor(options.engine, host);
    const origin = new URL(recording.manifest.url).origin;
    const config = playerConfig(recording, host, options, { tracks, clip, read });
    const shim = readFileSync(path.join(HOSTS_DIR, 'youtube-player-mechanism-fixture.js'), 'utf8');
    const script = `<script data-yomu-recorded-host="youtube-player">${shim}\n;window.__yomuRecordedYouTubePlayer(${JSON.stringify(config).replace(/</gu, '\\u003c')});</script>`;
    const routes = [
        [url => url.origin === origin && url.pathname.startsWith(CLIP_PATH), request => ({ served: 'recording', response: rangeResponse(read(clip.file), clip.type, request.headers().range) })],
        [url => url.hostname.endsWith('youtube.com') && url.pathname === '/api/timedtext', (request, url) => ({ served: 'host', response: timedTextResponse(tracks, url) })],
    ];
    return {
        documentHtml: html => html.replace(/<head(\s[^>]*)?>/iu, match => `${match}${script}`),
        async answer(request) {
            const url = new URL(request.url());
            const route = routes.find(([matches]) => matches(url));
            return route ? route[1](request, url) : null;
        },
    };
}

function rangeResponse(bytes, contentType, rangeHeader) {
    const range = /bytes=(\d+)-(\d*)/u.exec(rangeHeader ?? '');
    const headers = { 'content-type': contentType, 'accept-ranges': 'bytes' };
    if (!range) return { status: 200, headers: { ...headers, 'content-length': String(bytes.length) }, body: bytes };
    const start = Number(range[1]);
    const end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
    return {
        status: 206,
        headers: { ...headers, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': String(end - start + 1) },
        body: bytes.subarray(start, end + 1),
    };
}

const TIMEDTEXT_FORMATS = {
    json3: json3 => [JSON.stringify(json3), 'application/json; charset=utf-8'],
    vtt: json3 => [json3ToVtt(json3), 'text/vtt; charset=utf-8'],
    srv3: json3 => [json3ToSrv3(json3), 'text/xml; charset=utf-8'],
};

function timedTextResponse(tracks, url) {
    const tlang = url.searchParams.get('tlang') || null;
    const track = tracks.find(candidate => candidate.lang === url.searchParams.get('lang') && (candidate.tlang ?? null) === tlang);
    // YouTube answers an unknown track with an empty 200, not a 404.
    if (!track) return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...CORS }, body: '' };
    const format = TIMEDTEXT_FORMATS[url.searchParams.get('fmt')] ?? TIMEDTEXT_FORMATS.srv3;
    const [body, contentType] = format(track.json3);
    return { status: 200, headers: { 'content-type': contentType, ...CORS }, body };
}

const escapeXml = text => String(text).replace(/[<>&"]/gu, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[char]);
const xmlAttributes = pairs => pairs.filter(([, value]) => value !== undefined).map(([name, value]) => ` ${name}="${value}"`).join('');

function srv3Segment(seg) {
    return `<s${xmlAttributes([['t', seg.tOffsetMs || undefined], ['ac', seg.acAsrConf]])}>${escapeXml(seg.utf8 ?? '')}</s>`;
}

function srv3Paragraph(event) {
    const attributes = ` t="${event.tStartMs ?? 0}"${xmlAttributes([['d', event.dDurationMs], ['w', event.wWinId], ['a', event.aAppend ? 1 : undefined]])}`;
    return `<p${attributes}>${(event.segs ?? []).map(srv3Segment).join('')}</p>`;
}

/** YouTube's srv3 XML for the same events, so the product's first format request is answered as on the site. */
export function json3ToSrv3(json3) {
    const paragraphs = (json3.events ?? []).filter(event => event.segs || event.aAppend).map(srv3Paragraph);
    return `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3">\n<body>\n${paragraphs.join('\n')}\n</body>\n</timedtext>\n`;
}

function vttStamp(ms) {
    const total = Math.max(0, Math.round(ms));
    const pad = (value, width = 2) => String(value).padStart(width, '0');
    return `${pad(Math.floor(total / 3_600_000))}:${pad(Math.floor(total / 60_000) % 60)}:${pad(Math.floor(total / 1000) % 60)}.${pad(total % 1000, 3)}`;
}

function vttCue(event) {
    const start = event.tStartMs ?? 0;
    return { start, end: start + (event.dDurationMs ?? 0), text: event.segs.map(seg => seg.utf8 ?? '').join('').trim() };
}

export function json3ToVtt(json3) {
    const cues = (json3.events ?? []).filter(event => event.segs && !event.aAppend).map(vttCue).filter(cue => cue.text);
    return `WEBVTT\n\n${cues.map(cue => `${vttStamp(cue.start)} --> ${vttStamp(cue.end)}\n${cue.text}`).join('\n\n')}\n`;
}
