# Yomu JPDB Public Proxy

Cloudflare Worker CORS proxy for public resources used by Yomu. It accepts public HTTP and HTTPS targets as a fallback for hosted-page media, public pages, dictionary ZIP downloads, and custom audio sources. It forwards arbitrary HTTP methods so user-configured audio and dictionary workflows can work through the same endpoint.

It accepts:

```text
https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=https://jpdb.io/kanji/%E5%9B%B3
```

The worker strips hop-by-hop and browser metadata headers before forwarding, adds CORS response headers, removes `set-cookie`, and injects the public JPDB static-audio access header for `/static/v/` audio assets. It is a broad public proxy by design; restrict `isAllowedPublicProxyTarget` before deploying if you want a narrower private endpoint.

## Rate-limit politeness

Because many Yomu clients share this single proxy, the worker is designed not to overload the upstreams it forwards to (jiten.moe, jpdb.io). All caching is scoped to **deterministic, user-agnostic GETs** — never anything carrying an `Authorization` header, so per-user SRS/known-word state can't leak or be cached across clients:

- **Edge cache** (`caches.default`): caches the cacheable public GETs below so the same word looked up by many clients resolves from Cloudflare instead of the origin. Jiten `/api/vocabulary/<id>/<ri>/info` and `/api/kanji/*` for 1h; `/api/vocabulary/parse[-normalised]` and `/api/vocabulary/search`, plus jpdb `/search` and `/vocabulary/*`, for 10m. **The Cache API is only best-effort on a `workers.dev` subdomain — put the worker on a custom domain (a route on a Cloudflare zone) to make this layer effective.**
- **In-isolate micro-cache + coalescing** (`coalesceOriginRequest`): concurrent identical lookups collapse to one upstream request, and each cacheable response is reused for ~60s per isolate. This works even on `workers.dev`, so a burst of clients hitting the same popular word only touches the origin once.
- **Retry policy**: idempotent GETs retry once on *transient* gateway/connection/TLS failures (`502/504/520-527`), but **never on `500`/`503`** — when a server is erroring or explicitly overloaded, the worker returns immediately so the client backs off instead of the proxy piling on.

Clients (the userscript / hosted reader) further minimise load: keyed users batch reading through Jiten's `reader/parse` + `reader/lookup-vocabulary` (one request per line/page, not per word), keyless per-word lookups are capped and cached, and 429/`Retry-After` is honoured.

Deploy:

```bash
npx wrangler deploy --config workers/jpdb-public-proxy/wrangler.toml
```
