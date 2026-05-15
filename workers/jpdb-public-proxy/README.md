# Yomu JPDB Public Proxy

Restricted Cloudflare Worker CORS proxy for public resources used by Yomu.

It accepts:

```text
https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=https://jpdb.io/kanji/%E5%9B%B3
```

The worker strips cookies and authorization headers before forwarding requests. It is not for logged-in JPDB actions or secret-bearing API calls.

Deploy:

```bash
npx wrangler deploy --config workers/jpdb-public-proxy/wrangler.toml
```
