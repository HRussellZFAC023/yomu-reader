---
title: Yomu Academy sprite production v2
status: in production
owner: Codex sprite production
asset_root: public/academy/art/codex-production-v2/sprites
---

# Sprite production v2

This is a fresh runtime sprite set. It is deliberately separate from the old
`characters/claude-production`, `characters/production`, `characters/cast`, and
`characters/sprites` folders so that a weak or duplicated sprite cannot quietly
become the new default.

The source of truth is [`source-map.json`](../../../../../public/academy/art/codex-production-v2/sprites/source-map.json).
It locks the 21 Academy characters, the wardrobe and identity details that must
not drift, the ten expression slots, the reference images, and the technical QA
contract.

## Art bar

The target is the supplied blue-hour campus ensemble: warm painterly anime-film
realism, clear adult faces, restrained cel shading, subtle pixel-painted texture,
and silhouettes that read immediately on top of a full-page location background.
The result should feel like a hand-directed visual novel illustration, not a
vector avatar, stock portrait, or generic AI character sheet.

Sprites use neutral studio light while isolated. The indigo/teal and amber
blue-hour relationship is supplied by the environment composite. This keeps one
character usable in the classroom, pub, station, library, ramen shop, and rain
scenes without a pasted-on lighting mismatch.

## Identity locks

- Aakash's default sprite has normal hair and clothes, with no hat or beanie.
- Tom is unmistakably blond and clean-shaven in every expression.
- Sophie reads as Chinese/Hong Kong, has dark hair, and wears no glasses.
- Mika is a blond man with thin glasses.
- Christian is Black with a neat ponytail.
- Xingyu is a woman with a short undercut and round glasses.
- Francis has no glasses.
- Miller and Tawapon are original Academy textbook cameos, not copied coursebook
  illustrations.

## Generation and QA

The v2 generator uses the existing shared art/keying implementation from the
v3 pipeline as a read-only dependency. Its output root is v2 only. It writes a
sibling metadata file for every image, then the QA script records dimensions,
alpha health, hashes, and duplicate checks in `SPRITE-MANIFEST.json` and builds
`CONTACT-SHEET.png`.

```bash
python3 docs/academy/art/codex-production-v2/sprites/pipeline/generate.py \
  --characters rie,aakash,tom,sophie,christian \
  --expressions neutral \
  --workers 2

python3 docs/academy/art/codex-production-v2/sprites/pipeline/qa.py
```

The full matrix is 21 characters x 10 expressions. The first sample is a hard
quality gate for likeness/wardrobe and transparent compositing. Do not wire
runtime paths or delete old art until the full manifest and contact sheet have
been reviewed.

## Ownership

This workstream may write only:

- `public/academy/art/codex-production-v2/sprites/**`
- `docs/academy/art/codex-production-v2/sprites/**`

It must not edit Academy runtime code, CSS, old art directories, story files, or
the high-quality Aakash event illustrations.
