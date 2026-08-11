# Yomu JPDB Public Proxy

Cloudflare Worker CORS proxy for public resources used by Yomu. It is intentionally narrow: anonymous `GET`/`HEAD` requests to allowlisted JPDB, Jiten, Jisho, ImmersionKit, Bunpro pronunciation, and other known public audio URLs only. It rejects credential headers, sensitive URL parameters, private-network targets, arbitrary hosts, and write methods. Uchisen and its ImageKit media are not allowlisted; Yomu retains only a direct outbound lookup link.

It accepts:

```text
https://edge.yomureader.com/?url=https://jpdb.io/kanji/%E5%9B%B3
```

The worker strips caller headers before forwarding, adds CORS response headers, removes `set-cookie`, and injects the public JPDB static-audio access header for `/static/v/` audio assets.

Health/status:

```text
https://edge.yomureader.com/status
```

Runtime knobs:

- `PUBLIC_PROXY_DISABLED=true` returns `503` without touching upstreams.
- `PUBLIC_PROXY_DAILY_REQUEST_LIMIT=<n>` caps forwarded requests per isolate/day. Production starts at `100000` as a soft guard; set `0` only for controlled smoke tests.
- `PUBLIC_PROXY_ANALYTICS_LOGS=true` writes sanitized structured logs: host, target kind, status, outcome, and budget counters only. It never logs query strings, request headers, cookies, or tokens.

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

Production should run on a Cloudflare zone route/custom domain such as `edge.yomureader.com`. The old `workers.dev` URL stays useful for smoke tests, but the hosted reader defaults to the Yomu-domain endpoint so edge caching works consistently.
