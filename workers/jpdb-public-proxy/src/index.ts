const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST']);
const READ_METHODS = new Set(['GET', 'HEAD']);
const CACHEABLE_GET_HOSTS = new Set(['jpdb.io', 'jisho.org', 'commons.wikimedia.org', 'uchisen.com', 'ik.imagekit.io']);
const CORS_HEADERS = 'accept, content-type, range';
const MAX_REDIRECTS = 4;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CREDENTIAL_REQUEST_HEADERS = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key'];

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerCaches {
  default: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return preflight(request);
    if (!ALLOWED_METHODS.has(request.method)) return corsText(request, 'Method not allowed.', 405);
    if (hasCredentialRequestHeaders(request)) return corsText(request, 'Credential-bearing requests are not allowed.', 400);

    const target = targetUrl(request);
    if (!target) return corsText(request, 'Missing url parameter.', 400);
    if (!isAllowedTarget(request, target, env)) return corsText(request, 'Target is not allowed.', 403);

    const cache = (caches as unknown as WorkerCaches).default;
    const cacheKey = new Request(cacheKeyUrl(request, target), { method: 'GET' });
    if (request.method === 'GET' && CACHEABLE_GET_HOSTS.has(target.hostname)) {
      const cached = await cache.match(cacheKey);
      if (cached) return withCors(request, cached);
    }

    const upstream = await fetchAllowedTarget(request, target, env);
    const response = withCors(request, upstream);
    if (request.method === 'GET' && upstream.ok && CACHEABLE_GET_HOSTS.has(target.hostname)) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  },
};

interface Env {
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
  return isAllowedPublicProxyTarget(request.method, target, env)
    && isAllowedPublicProxyRequest(request, target);
}

export function isAllowedPublicProxyTarget(method: string, target: URL, _env: Env = {}): boolean {
  const normalizedMethod = method.toUpperCase();
  if (target.protocol !== 'https:') return false;
  if (READ_METHODS.has(normalizedMethod)) return isAllowedGetTarget(target);
  if (normalizedMethod === 'POST') return isAllowedPostTarget(target);
  return false;
}

function isAllowedPublicProxyRequest(request: Request, target: URL): boolean {
  if (request.method !== 'POST') return true;
  if (!isAllowedPostTarget(target)) return false;
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  return contentType === 'application/x-www-form-urlencoded';
}

function isAllowedGetTarget(target: URL): boolean {
  switch (target.hostname) {
    case 'assets.languagepod101.com':
      return target.pathname === '/dictionary/japanese/audiomp3.php';
    case 'api.jiten.moe':
      return target.pathname === '/api/frequency-list/download';
    case 'commons.wikimedia.org':
      return target.pathname === '/w/api.php';
    case 'github.com':
      return isGithubZipDownloadPath(target.pathname);
    case 'ik.imagekit.io':
      return target.pathname.startsWith('/uchisen/');
    case 'jisho.org':
      return target.pathname.startsWith('/search/');
    case 'jpdb.io':
      return isPublicJpdbPath(target.pathname);
    case 'objects.githubusercontent.com':
      return isGithubObjectDownloadPath(target.pathname);
    case 'raw.githubusercontent.com':
      return isAllowedRawGithubPath(target.pathname);
    case 'release-assets.githubusercontent.com':
      return isGithubReleaseAssetPath(target.pathname);
    case 'uchisen.com':
      return /^\/kanji\/[^/]+\/?$/.test(target.pathname);
    case 'upload.wikimedia.org':
      return isPublicMediaPath(target.pathname);
    default:
      return false;
  }
}

function isAllowedPostTarget(target: URL): boolean {
  return target.hostname === 'www.japanesepod101.com'
    && target.pathname === '/learningcenter/reference/dictionary_post';
}

function isPublicJpdbPath(pathname: string): boolean {
  return pathname === '/search'
    || /^\/(?:kanji|vocabulary)(?:\/|$)/.test(pathname);
}

function isGithubZipDownloadPath(pathname: string): boolean {
  return /^\/[^/]+\/[^/]+\/(?:releases\/(?:latest\/download|download\/[^/]+)|archive\/refs\/(?:heads|tags))\/[^/]+\.zip$/i.test(pathname);
}

function isGithubObjectDownloadPath(pathname: string): boolean {
  return pathname.startsWith('/github-production-release-asset-')
    || pathname.startsWith('/github-production-repository-file-');
}

function isGithubReleaseAssetPath(pathname: string): boolean {
  return pathname.startsWith('/github-production-release-asset/');
}

function isAllowedRawGithubPath(pathname: string): boolean {
  return /\.(?:zip|json|css|svg)$/i.test(pathname);
}

function isPublicMediaPath(pathname: string): boolean {
  return /\.(?:mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(pathname);
}

async function fetchAllowedTarget(request: Request, target: URL, env: Env, redirects = 0): Promise<Response> {
  const upstream = await fetch(target.href, upstreamInit(request));
  if (!shouldFollowRedirect(request, upstream)) return upstream;
  if (redirects >= MAX_REDIRECTS) return new Response('Too many redirects.', { status: 508 });

  const next = redirectTarget(target, upstream.headers.get('location'));
  if (!next || !isAllowedPublicProxyTarget('GET', next, env)) {
    return new Response('Redirect target is not allowed.', { status: 403 });
  }
  return fetchAllowedTarget(new Request(request, { method: 'GET', body: null }), next, env, redirects + 1);
}

function upstreamInit(request: Request): RequestInit {
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.delete('authorization');
  headers.delete('proxy-authorization');
  headers.delete('x-api-key');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('host');
  return {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  };
}

function shouldFollowRedirect(request: Request, response: Response): boolean {
  return request.method === 'GET'
    && REDIRECT_STATUSES.has(response.status)
    && Boolean(response.headers.get('location'));
}

function redirectTarget(current: URL, location: string | null): URL | null {
  if (!location) return null;
  try {
    return new URL(location, current.href);
  } catch {
    return null;
  }
}

function hasCredentialRequestHeaders(request: Request): boolean {
  return CREDENTIAL_REQUEST_HEADERS.some(header => request.headers.has(header));
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
  headers.set('access-control-expose-headers', 'content-type, content-length, accept-ranges, content-range, cache-control');
  headers.set('access-control-max-age', '86400');
  headers.set('vary', 'Origin');
  return headers;
}

function allowedOrigin(_request: Request): string {
  return '*';
}
