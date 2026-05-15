const ALLOWED_HOSTS = new Set([
  'assets.languagepod101.com',
  'commons.wikimedia.org',
  'github.com',
  'githubusercontent.com',
  'jisho.org',
  'jpdb.io',
  'raw.githubusercontent.com',
  'www.japanesepod101.com',
]);

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST']);
const CACHEABLE_GET_HOSTS = new Set(['jpdb.io', 'jisho.org', 'commons.wikimedia.org']);
const CORS_HEADERS = 'authorization, content-type, range';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight(request);
    if (!ALLOWED_METHODS.has(request.method)) return corsText(request, 'Method not allowed.', 405);

    const target = targetUrl(request);
    if (!target) return corsText(request, 'Missing url parameter.', 400);
    if (!isAllowedTarget(request, target, env)) return corsText(request, 'Target is not allowed.', 403);

    const cache = caches.default;
    const cacheKey = new Request(cacheKeyUrl(request, target), { method: 'GET' });
    if (request.method === 'GET' && CACHEABLE_GET_HOSTS.has(target.hostname)) {
      const cached = await cache.match(cacheKey);
      if (cached) return withCors(request, cached);
    }

    const upstream = await fetch(target.href, upstreamInit(request));
    const response = withCors(request, upstream);
    if (request.method === 'GET' && upstream.ok && CACHEABLE_GET_HOSTS.has(target.hostname)) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};

interface Env {
  EXTRA_ALLOWED_HOSTS?: string;
}

function targetUrl(request: Request): URL | null {
  try {
    const url = new URL(request.url);
    const raw = url.searchParams.get('url');
    return raw ? new URL(raw) : null;
  } catch {
    return null;
  }
}

function isAllowedTarget(request: Request, target: URL, env: Env): boolean {
    if (target.protocol !== 'https:') return false;
    if (target.hostname === 'jpdb.io') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return false;
      if (target.pathname.startsWith('/api/')) return false;
    }
    if (ALLOWED_HOSTS.has(target.hostname)) return true;
    return extraAllowedHosts(env).has(target.hostname);
}

function extraAllowedHosts(env: Env): Set<string> {
  return new Set((env.EXTRA_ALLOWED_HOSTS ?? '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean));
}

function upstreamInit(request: Request): RequestInit {
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('authorization');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('host');
  return {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'follow',
  };
}

function cacheKeyUrl(request: Request, target: URL): string {
  const url = new URL(request.url);
  url.search = '';
  url.searchParams.set('url', target.href);
  return url.href;
}

function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function corsText(request: Request, text: string, status: number): Response {
  return new Response(text, { status, headers: corsHeaders(request) });
}

function withCors(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request);
  cors.forEach((value, key) => headers.set(key, value));
  headers.delete('set-cookie');
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=1800');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  headers.set('access-control-allow-origin', allowedOrigin(request));
  headers.set('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS');
  headers.set('access-control-allow-headers', CORS_HEADERS);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-expose-headers', 'content-type, content-length, accept-ranges, content-range, cache-control');
  headers.set('access-control-max-age', '86400');
  headers.set('vary', 'Origin');
  return headers;
}

function allowedOrigin(request: Request): string {
  const origin = request.headers.get('Origin') ?? '';
  if (isYomuOrigin(origin)) return origin;
  return 'https://hrussellzfac023.github.io';
}

function isYomuOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.hostname === 'hrussellzfac023.github.io'
      || url.hostname === 'localhost'
      || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
