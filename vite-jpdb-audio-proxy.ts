import { Buffer } from 'node:buffer';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const JPDB_AUDIO_ROUTE_PREFIX = '/__yomu-jpdb-audio/';
const JPDB_AUDIO_BASE_URL = 'https://jpdb.io/static/v/';
const JPDB_AUDIO_ACCESS_HEADER = "please don't steal these files";
const JPDB_AUDIO_ID_RE = /^[A-Za-z0-9_./-]+$/;

export function jpdbAudioDevProxyPlugin(): Plugin {
    return {
        name: 'yomu-jpdb-audio-dev-proxy',
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                if (!isJpdbAudioProxyRequest(request)) {
                    next();
                    return;
                }

                await handleJpdbAudioProxyRequest(request, response);
            });
        },
    };
}

function isJpdbAudioProxyRequest(request: IncomingMessage): boolean {
    return requestPathname(request).startsWith(JPDB_AUDIO_ROUTE_PREFIX);
}

async function handleJpdbAudioProxyRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    setCorsHeaders(response);
    if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' });
        response.end('Method not allowed.');
        return;
    }

    const audioId = requestAudioId(request);
    if (!isSafeJpdbAudioId(audioId)) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Invalid JPDB audio id.');
        return;
    }

    try {
        const upstream = await fetch(jpdbAudioUrl(audioId), {
            headers: jpdbAudioHeaders(request),
        });
        copyProxyResponseHeaders(upstream, response);
        response.statusCode = upstream.status;
        response.statusMessage = upstream.statusText;
        if (request.method === 'HEAD') {
            response.end();
            return;
        }
        response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
        response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(error instanceof Error ? error.message : 'JPDB audio proxy request failed.');
    }
}

function requestPathname(request: IncomingMessage): string {
    return requestUrl(request).pathname;
}

function requestAudioId(request: IncomingMessage): string {
    const rawPath = requestPathname(request).slice(JPDB_AUDIO_ROUTE_PREFIX.length);
    try {
        return rawPath.split('/').map(segment => decodeURIComponent(segment)).join('/');
    } catch {
        return '';
    }
}

function requestUrl(request: IncomingMessage): URL {
    return new URL(request.url ?? '/', 'http://127.0.0.1');
}

function isSafeJpdbAudioId(audioId: string): boolean {
    return Boolean(audioId)
        && JPDB_AUDIO_ID_RE.test(audioId)
        && !audioId.includes('..')
        && !audioId.startsWith('/')
        && !audioId.startsWith('//');
}

function jpdbAudioUrl(audioId: string): string {
    return new URL(encodeJpdbAudioPath(audioId), JPDB_AUDIO_BASE_URL).toString();
}

function encodeJpdbAudioPath(audioId: string): string {
    return audioId.split('/').map(encodeURIComponent).join('/');
}

function jpdbAudioHeaders(request: IncomingMessage): Headers {
    const headers = new Headers({ 'X-Access': JPDB_AUDIO_ACCESS_HEADER });
    const forceCaf = requestUrl(request).searchParams.get('force_caf');
    if (forceCaf) headers.set('X-ForceCAF', forceCaf);
    return headers;
}

function copyProxyResponseHeaders(upstream: Response, response: ServerResponse): void {
    for (const header of ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified']) {
        const value = upstream.headers.get(header);
        if (value) response.setHeader(header, value);
    }
}

function setCorsHeaders(response: ServerResponse): void {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'X-Access, X-ForceCAF, Content-Type');
}
