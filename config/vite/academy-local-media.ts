import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import manifestJson from "../../workers/yomu-academy/media-manifest.json";

type SourceCollection = "persona" | "shinday";

interface MediaEntry {
  readonly key: string;
  readonly sourceCollection: SourceCollection;
  readonly sourceRelativePath: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface ByteRange {
  readonly start: number;
  readonly end: number;
}

const ROUTE_PREFIX = "/academy/media/audio/";
const STORAGE_PREFIX = "media/audio/";

export interface AcademyLocalMediaRoots {
  readonly persona?: string;
  readonly shinday?: string;
}

export function academyLocalMedia(roots: AcademyLocalMediaRoots): Plugin {
  const entries = new Map<string, MediaEntry>();
  for (const value of manifestJson.objects) {
    const entry = value as MediaEntry;
    const routeKey = publicRouteKey(entry.key);
    if (entries.has(routeKey))
      throw new TypeError(`Duplicate Academy media route: ${routeKey}`);
    entries.set(routeKey, entry);
  }
  const verified = new Map<string, string>();

  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): void => {
    void serveLocalMedia(request, response, roots, entries, verified)
      .then((served) => {
        if (!served) next();
      })
      .catch(next);
  };

  return {
    name: "academy-local-media",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

async function serveLocalMedia(
  request: IncomingMessage,
  response: ServerResponse,
  roots: AcademyLocalMediaRoots,
  entries: ReadonlyMap<string, MediaEntry>,
  verified: Map<string, string>,
): Promise<boolean> {
  const pathname = new URL(request.url ?? "/", "http://academy.local").pathname;
  if (!pathname.startsWith(ROUTE_PREFIX)) return false;

  let routeKey: string;
  try {
    routeKey = decodeURIComponent(pathname.slice(ROUTE_PREFIX.length));
  } catch {
    return false;
  }
  const entry = entries.get(routeKey);
  if (!entry) return false;
  const sourceRoot = roots[entry.sourceCollection];
  if (!sourceRoot) return false;

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("allow", "GET, HEAD");
    response.end();
    return true;
  }

  const resolvedRoot = path.resolve(sourceRoot);
  const sourcePath = path.resolve(resolvedRoot, entry.sourceRelativePath);
  if (!sourcePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new TypeError(
      `Academy media source escaped its ${entry.sourceCollection} root.`,
    );
  }
  verifySource(sourcePath, entry, verified);

  response.setHeader("content-type", entry.contentType);
  response.setHeader("cache-control", "private, max-age=3600");
  response.setHeader("accept-ranges", "bytes");
  response.setHeader("etag", `"${entry.sha256}"`);
  response.setHeader("cross-origin-resource-policy", "same-origin");
  response.setHeader("x-content-type-options", "nosniff");

  if (matchesEtag(request.headers["if-none-match"], entry.sha256)) {
    response.statusCode = 304;
    response.end();
    return true;
  }

  const range = parseRange(request.headers.range, entry.bytes);
  if (range === "unsatisfiable") {
    response.statusCode = 416;
    response.setHeader("content-range", `bytes */${entry.bytes}`);
    response.end();
    return true;
  }

  const length = range ? range.end - range.start + 1 : entry.bytes;
  response.statusCode = range ? 206 : 200;
  response.setHeader("content-length", String(length));
  if (range)
    response.setHeader(
      "content-range",
      `bytes ${range.start}-${range.end}/${entry.bytes}`,
    );
  if (request.method === "HEAD") {
    response.end();
    return true;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(
      sourcePath,
      range ? { start: range.start, end: range.end } : undefined,
    );
    stream.once("error", reject);
    response.once("finish", resolve);
    response.once("close", resolve);
    stream.pipe(response);
  });
  return true;
}

function publicRouteKey(storageKey: string): string {
  return storageKey.startsWith(STORAGE_PREFIX)
    ? storageKey.slice(STORAGE_PREFIX.length)
    : storageKey;
}

function verifySource(
  sourcePath: string,
  entry: MediaEntry,
  verified: Map<string, string>,
): void {
  const stats = statSync(sourcePath);
  const identity = `${stats.size}:${stats.mtimeMs}:${entry.sha256}`;
  if (verified.get(sourcePath) === identity) return;
  if (stats.size !== entry.bytes) {
    throw new TypeError(`Academy media size mismatch for ${entry.key}.`);
  }
  const digest = createHash("sha256")
    .update(readFileSync(sourcePath))
    .digest("hex");
  if (digest !== entry.sha256) {
    throw new TypeError(`Academy media hash mismatch for ${entry.key}.`);
  }
  verified.set(sourcePath, identity);
}

function matchesEtag(
  header: string | string[] | undefined,
  sha256: string,
): boolean {
  const value = Array.isArray(header) ? header.join(",") : header;
  if (!value) return false;
  return value.split(",").some((tag) => {
    const cleaned = tag.trim().replace(/^W\//u, "").replaceAll('"', "");
    return cleaned === sha256 || cleaned === "*";
  });
}

function parseRange(
  header: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;
  if (match[1] === "") {
    const suffix = Math.min(Number(match[2]), size);
    return suffix === 0
      ? "unsatisfiable"
      : { start: size - suffix, end: size - 1 };
  }
  const start = Number(match[1]);
  if (start >= size) return "unsatisfiable";
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  return end < start ? null : { start, end };
}
