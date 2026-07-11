# Academy asset audit

`public/academy/art/asset-usage.json` is the deterministic inventory of Academy
media. It records what ships, what exists only in the research mirrors, what
runtime source can address, and which paths contain identical bytes. The audit
does not delete, move, or rewrite any asset.

## Scope

The scanner walks these roots recursively, including hidden directories:

- `public/academy`: shipped Academy files
- `references-academy`: research and reference files that are not shipped

Regular files and file symlinks are included when their extension is in the
case-insensitive policy below. Directory symlinks are followed under their
logical in-root path; an ancestor-realpath check stops recursive link cycles.
Broken links have no bytes and are ignored. The stored extension is lowercase
and includes its leading dot.

| Kind | Extensions |
| --- | --- |
| Raster | `.ani`, `.apng`, `.avif`, `.bmp`, `.cur`, `.dib`, `.gif`, `.heic`, `.heif`, `.ico`, `.j2c`, `.j2k`, `.jfif`, `.jp2`, `.jpe`, `.jpeg`, `.jpg`, `.jxl`, `.png`, `.tga`, `.tif`, `.tiff`, `.webp` |
| Vector | `.ai`, `.emf`, `.eps`, `.ps`, `.svg`, `.svgz`, `.wmf` |
| Audio | `.aac`, `.ac3`, `.aif`, `.aiff`, `.alac`, `.amr`, `.ape`, `.au`, `.caf`, `.flac`, `.m4a`, `.mid`, `.midi`, `.mka`, `.mp3`, `.oga`, `.ogg`, `.opus`, `.ra`, `.snd`, `.wav`, `.weba`, `.wma` |

JSON sidecars and the manifest itself are outside this media policy.

## Commands

Generate the manifest from the current tree:

```sh
node scripts/audit-academy-assets.mjs
```

Verify that the checked-in bytes are current without writing:

```sh
node scripts/audit-academy-assets.mjs --check
```

Write or check another output path with `--output <file>`. Unknown arguments,
missing output values, missing asset roots, and a missing `src/academy`
directory fail with a nonzero exit. A normal run hashes through a bounded pool
of 16 streams, so memory and open-file use do not grow with the 12,000-file
research tree.

Run the focused verification with the Academy-only Vite configuration:

```sh
npx vitest run --config config/vite/academy.config.ts tests/academy/asset-audit.test.ts
```

The Academy-only config avoids starting unrelated userscript development
plugins while exercising the same Vitest test file.

## Classifications

Every path has exactly one disposition:

- `used`: a canonical `public/academy` path matched by Academy runtime source.
- `archive`: a canonical `public/academy` path with no runtime match.
- `candidate`: a canonical `references-academy` path. Reference material is not
  promoted to shipped runtime content by this audit.
- `duplicate`: a noncanonical member of an exact SHA-256 group. Its
  `duplicateOf` value names the canonical repo-relative path.

`archive` and `candidate` are audit labels, not deletion instructions. A path
classified `duplicate` is also retained. Runtime evidence remains attached to
a duplicate if source addresses that noncanonical path.

## Runtime evidence

Runtime scanning covers `src/academy` recursively plus
`academy-studio.html` and `public/academy/index.html`. JavaScript and
TypeScript variants (`.cjs`, `.js`, `.jsx`, `.mjs`, `.ts`, `.tsx`) are parsed
with the TypeScript compiler API, so comments do not count as references.
CSS and HTML variants have block or HTML comments blanked before path matching.

The scanner extracts media paths even when they are embedded inside a larger
markup string. It also evaluates simple string constants and concatenations
before reducing unresolved expressions to a one-segment wildcard. This covers
both established Academy forms:

```ts
`./art/environments/${directory}/${variant}-wide.webp`
`${SPRITE_DIR}${id}.png`
```

Each manifest match records the repo-relative source file, one-based line,
matched expression, and either `literal` or `pattern`. Pattern evidence is a
conservative static match: it proves that the source expression can construct
the path shape, not that a particular branch is reachable for every matching
file. String-constant lookup is intentionally file-level rather than a full
scope/type analysis, so reused constant names in disjoint scopes can broaden or
misattribute a pattern. CSS and HTML are not full language parses; in
particular, a `//` comment inside an inline HTML script can conservatively count
as text evidence. Fully computed paths with no literal `art/`, `audio/`,
`media/`, or `/academy/` anchor cannot be recovered statically and remain a
manual-review case.

## Duplicate policy

Files are grouped by SHA-256 across both roots. Canonical selection is stable:

1. A runtime-referenced `public/academy` member.
2. Another `public/academy` member.
3. A `references-academy` member.
4. Repo-relative POSIX path as the lexical tie-breaker.

This keeps a shipped runtime path canonical even when an identical research or
production copy sorts earlier. `duplicateGroups` records the hash, byte length,
canonical path, and all sorted member paths. Tests independently regroup the
manifest by hash and reject any shipped duplicate that lacks this accounting.

## Determinism

The manifest schema is `yomu-academy-asset-usage/v1`. Every asset records its
repo-relative POSIX path, root, media kind, lowercase extension, byte length,
SHA-256, classification, and sorted runtime references. Duplicate paths also
record `duplicateOf`.

No timestamps or absolute paths are emitted. Paths, references, hash groups,
and extension lists have fixed ordering. `--check` compares the complete
serialized file, including formatting, so traversal-order or schema drift is
visible.

## Current result

The generation represented by the checked-in manifest contains:

| Measure | Result |
| --- | ---: |
| Assets | 12,215 |
| Bytes inventoried | 269,103,620 |
| Shipped (`public/academy`) | 234 assets / 144,706,762 bytes |
| References (`references-academy`) | 11,981 assets / 124,396,858 bytes |
| Used | 102 assets |
| Archive | 55 assets |
| Candidate | 11,962 assets |
| Duplicate | 96 assets in 59 groups |
| Shipped duplicate paths | 77 assets / 41,720,090 bytes |

Regenerate after any in-scope media or Academy runtime-source change, then run
`--check` and the focused test before merging.
