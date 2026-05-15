# Yomu JPDB Public Proxy

Restricted Cloudflare Worker CORS proxy for public resources used by Yomu. It accepts public HTTPS `GET`/`HEAD` requests as a fallback for hosted-page media and public pages, while explicitly blocking private/local network targets and sensitive JPDB API paths. `POST` is still allowlisted only for the public JapanesePod101 dictionary endpoint.

It accepts:

```text
https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=https://jpdb.io/kanji/%E5%9B%B3
```

The worker rejects requests that include cookies or authorization-like headers, strips credential headers before forwarding, validates redirects, and does not proxy logged-in JPDB actions or secret-bearing API calls.

Deploy:

```bash
npx wrangler deploy --config workers/jpdb-public-proxy/wrangler.toml
```
