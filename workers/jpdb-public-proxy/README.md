# Yomu JPDB Public Proxy

Restricted Cloudflare Worker CORS proxy for public resources used by Yomu. It is an allowlisted fetcher for known public pages, media, and dictionary ZIP downloads, not a general-purpose proxy.

It accepts:

```text
https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=https://jpdb.io/kanji/%E5%9B%B3
```

The worker rejects requests that include cookies or authorization-like headers, strips credential headers before forwarding, validates redirects, and only allows `GET`/`HEAD` except for the public JapanesePod101 dictionary endpoint. It is not for logged-in JPDB actions or secret-bearing API calls.

Deploy:

```bash
npx wrangler deploy --config workers/jpdb-public-proxy/wrangler.toml
```
