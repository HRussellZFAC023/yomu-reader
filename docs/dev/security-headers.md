# Security headers

Yomu's public surfaces are split between GitHub Pages and five Cloudflare
Workers. GitHub Pages cannot configure response headers, so the static origin
uses a Cloudflare Response Header Transform Rule and the Workers apply their
policy in code.

## Static host

The active production rule is named `Yomu static security headers`. It matches:

```text
(http.host eq "yomureader.com"
 and not starts_with(http.request.uri.path, "/academy/api/")
 and not starts_with(http.request.uri.path, "/academy/media/"))
```

It sets:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: frame-ancestors 'self'
```

`yomureader.com` was accepted as eligible and submitted to
`hstspreload.org` on 2026-07-29. It is pending inclusion; the header and HTTPS
coverage across every present and future subdomain must remain valid while the
browser lists process the submission.

The deliberately narrow CSP blocks third-party framing without imposing
`default-src`, `script-src`, `connect-src`, `worker-src`, or `media-src`
restrictions on the hosted Reader, Study app, new tab, or Academy shell. Those
applications use hosted and local resources, Web Workers, media, and optional
microphone recording; an unmeasured source allowlist would turn a header
hardening change into a product outage.

## Workers

`workers/shared/security-headers.ts` applies the following to every response,
including errors, preflights, and cache hits:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

An existing route-specific CSP takes precedence. The support Worker's donation
form therefore keeps its inline-style and same-origin-form policy.

The following headers are deliberately omitted:

- `Permissions-Policy`: the Reader and Academy expose optional microphone
  recording. A zone-wide microphone denial would break that feature.
- `X-Frame-Options`: `frame-ancestors` is the current, explicit framing policy;
  duplicating it creates two sources of truth.
- `Cross-Origin-Resource-Policy` and cross-origin isolation headers: audio,
  dictionaries, proxy results, and Academy media are intentionally consumed
  across origins by the userscript.

The static userscript's `Access-Control-Allow-Origin: *` is retained because
userscript managers and update clients fetch it cross-origin. Integrity is
handled by the published release artifact and checksum flow, not by making the
install URL unreadable to legitimate clients.
