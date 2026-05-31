# Yomu JPDB Public Proxy

Cloudflare Worker CORS proxy for public resources used by Yomu. It accepts public HTTP and HTTPS targets as a fallback for hosted-page media, public pages, dictionary ZIP downloads, and custom audio sources. It forwards arbitrary HTTP methods so user-configured audio and dictionary workflows can work through the same endpoint.

It accepts:

```text
https://yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev/?url=https://jpdb.io/kanji/%E5%9B%B3
```

The worker strips hop-by-hop and browser metadata headers before forwarding, adds CORS response headers, removes `set-cookie`, and injects the public JPDB static-audio access header for `/static/v/` audio assets. It is a broad public proxy by design; restrict `isAllowedPublicProxyTarget` before deploying if you want a narrower private endpoint.

Deploy:

```bash
npx wrangler deploy --config workers/jpdb-public-proxy/wrangler.toml
```
