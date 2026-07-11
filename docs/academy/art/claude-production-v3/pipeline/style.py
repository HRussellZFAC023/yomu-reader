"""
Yomu Academy — claude-production-v3 canonical style contract.

ONE shared style vocabulary so every art worker (character, environment, event,
prop, lesson) composites as a single cohesive cast/world. Derived from:
  - docs/academy/design/VISUAL-BIBLE.md  (normative learner-facing contract)
  - docs/academy/art/ENVIRONMENT-BIBLE.md
  - docs/academy/art/CAST-ART-BIBLE.md
  - the shipped anchors campus-blue-hour.webp + rie-sensei.webp (house-style bar)

Never edit the style tokens per-asset. Vary the *subject* text only. This is
what keeps 300+ assets looking like one production instead of a stock-art dump.
"""

# The finish. This mirrors the shipped anchors: warm painterly anime realism,
# clean confident lineart, subtle structured pixel grain, NOT flat vector, NOT
# photoreal, NOT a franchise imitation.
RENDER = (
    "warm hand-painted anime illustration, painterly anime-film realism, "
    "clean confident lineart, soft cel shading with subtle structured pixel grain "
    "in the shadows, believable adult human anatomy, expressive readable face, "
    "controlled cinematic lighting, high detail, cohesive single-production art direction"
)

# Blue-hour lighting relationship — the single most identity-defining token.
LIGHT = (
    "lighting: cool blue-hour indigo and teal ambient fill contrasted with warm "
    "amber practical light; gentle warm rim light; one consistent key direction; "
    "no rim-light gimmicks, no neon wash, no bloom, no lens flare"
)

# Palette anchors from the Visual Bible.
PALETTE = (
    "palette: deep indigo #293e62 and desaturated teal shadows, warm amber "
    "practical #d79a4b, coral/rose accent #b96b78, leaf green #2f7654, "
    "paper cream #e8dfcf; adult evening-class warmth, no one-note colour cast"
)

# Hard negative contract — every prompt carries this. Kills pseudo-text, logos,
# franchise mimicry, plastic AI faces, and the anti-AI defects the bible rejects.
NEGATIVE = (
    "no text, no lettering, no captions, no watermark, no logo, no crest, no "
    "brand, no signage, no readable writing, no UI, no interface, no border, "
    "no frame; do not imitate any specific game, anime, studio, franchise, or "
    "named artist; no copyrighted mascot or protected character; adults only, "
    "no school uniform, no child proportions, no idol-poster gloss; avoid "
    "plastic airbrushed skin, same-face syndrome, malformed hands, extra fingers, "
    "duplicated people, warped perspective, chroma fringe, halo edges, "
    "unmotivated bokeh"
)

# Flat chroma key field for transparent sprites. GREEN is the default because
# pale warm anime skin and cream fabric are far from green (a magenta key eats
# the face). Use magenta only when the subject/prop is green-dominant.
KEY_FIELDS = {
    "green": "flat solid #00ff00 chroma-green background",
    "magenta": "flat solid #ff00ff magenta background",
    "blue": "flat solid #0000ff chroma-blue background",
}
KEY_FIELD = KEY_FIELDS["green"]

# Lean negative for sprites — a long negative tail lets flux drift into painting a
# scene; keep only what protects isolation, anatomy, and rights.
NEGATIVE_SPRITE = (
    "no text, no watermark, no logo, no brand, no readable writing; adults only, "
    "no school uniform, no child proportions; believable hands, no extra fingers; "
    "no copyrighted mascot or franchise; no plastic airbrushed skin, no same-face"
)

# Sprite-local palette note — warmth of skin/wardrobe, NOT the scene palette (the
# blue-hour comes from compositing the sprite onto the environment plate).
PALETTE_SPRITE = (
    "warm believable skin, natural adult wardrobe colours, subtle structured "
    "pixel grain in the shading"
)

# Soft blue-hour studio field for busts/portraits (better face/style continuity).
BUST_FIELD = (
    "soft out-of-focus blue-hour classroom background, dialogue-safe calm lower third"
)


_HEX = {"green": "#00ff00", "magenta": "#ff00ff", "blue": "#0000ff"}


def sprite_style(key: str = "green") -> str:
    """Style suffix for transparent VN sprites (keyed to alpha).

    Chroma-forward: the isolation instruction leads AND closes so flux does not
    substitute a painted studio backdrop (which defeats chroma-keying). Even
    studio light, not blue-hour — the scene light is added by the plate."""
    field, hexv = KEY_FIELDS[key], _HEX[key]
    return (
        f"The figure is completely isolated on a {field}: the ENTIRE background is "
        f"one uniform perfectly flat {hexv} fill — no room, no scenery, no floor, "
        f"no wall, no cast shadow, no gradient, no texture, no reflection. "
        f"{RENDER}. Even soft neutral studio key light, {PALETTE_SPRITE}. "
        f"{NEGATIVE_SPRITE}. Reminder: solid flat {hexv} background only, nothing "
        f"behind the figure."
    )


def bust_style() -> str:
    """Style suffix for dialogue busts / portraits kept on a soft plate."""
    return f"Style: {RENDER}. {LIGHT}. {PALETTE}. {BUST_FIELD}. {NEGATIVE}."


def env_style() -> str:
    """Style suffix for empty environment plates (no people, no UI)."""
    return (
        f"Original Yomu Academy environment concept art, empty location plate, "
        f"no people, no crowd, no faces. {RENDER}. {LIGHT}. {PALETTE}. "
        f"Clear architectural perspective with a readable foreground, a mid-ground "
        f"interaction prop, and a background landmark; quiet dialogue-safe lower "
        f"foreground. {NEGATIVE}."
    )


def event_style() -> str:
    """Style suffix for story CG / event illustrations (may include figures)."""
    return (
        f"Yomu Academy story illustration CG. {RENDER}. {LIGHT}. {PALETTE}. "
        f"Cinematic emotional staging, believable adult figures, readable silhouettes. {NEGATIVE}."
    )


def prop_style(key: str = "green") -> str:
    """Style suffix for prop / food / object studies on a clean chroma key field."""
    field, hexv = KEY_FIELDS[key], _HEX[key]
    return (
        f"A single centered object study, floating, completely isolated on a {field}: "
        f"the ENTIRE background is one uniform perfectly flat {hexv} fill — no surface, "
        f"no table, no floor, NO cast shadow, NO ground shadow, no contact shadow, no "
        f"gradient, no texture. {RENDER}. Even soft flat studio light from the front, "
        f"{PALETTE_SPRITE}. {NEGATIVE_SPRITE}. Reminder: solid flat {hexv} background "
        f"only, object floating with no shadow."
    )
