#!/usr/bin/env python3
"""
Yomu Academy claude-production-v3 — the production matrix.

Emits every group spec (JSON) the shared generator consumes. Cohesion is
guaranteed because (a) all specs carry the SAME shared style suffix (added by
generate.py) and (b) every asset of a character is composed from ONE locked
identity descriptor here — so a character's face/hair/wardrobe never drift
between their bust, sprite, and expression variants.

Identity canon = the vetted per-person descriptors from scripts/generate_sprites.py
(which already bake in the reference-grounded corrections: Tom blond, Sophie
Chinese/HK, Mika a blond man, Christian Black with a ponytail, Xingyu a woman,
Francis no glasses) + src/academy/cast.ts. No real face is assigned to a name;
identity comes from the written canon only.

Run:  python3 build_specs.py         # writes specs/*.json
"""
from __future__ import annotations
import hashlib
import json
import os

SPECS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "specs"))


def _h(s) -> int:
    """Stable, process-independent hash (built-in hash() is randomized)."""
    return int(hashlib.md5(str(s).encode()).hexdigest()[:6], 16)

# --------------------------------------------------------------- identity canon
# Each entry: locked physical + wardrobe identity (NO handheld prop — props are
# added only where they render cleanly), a signature prop phrase for busts, a
# chroma key colour (green default; magenta when the subject is green-dominant),
# and a stable base seed for reproducibility.
CAST = {
    "rie": dict(seed=4218, key="green",
        who="Rie, a warm dignified adult Japanese woman teacher in her late 30s",
        look="detailed expressive face, dark hair in a soft loose bun with a few escaped strands, small stud earrings, warm tired-radiant presence",
        wear="a solid opaque cream cardigan over a dark navy blouse with a plain school lanyard",
        prop="a moss-green thermos and a small stack of marked worksheets"),
    "henry": dict(seed=5003, key="green",
        who="Henry, a friendly adult White man in his late 20s",
        look="messy short brown hair, friendly slightly sleepless eyes, faint stubble",
        wear="an indigo hoodie over a sky-blue tee, a backpack strap on one shoulder",
        prop="a laptop covered in abstract stickers"),
    "aakash": dict(seed=8833, key="green",
        who="Aakash, a stylish adult South-Asian man in his late 20s",
        look="a neat black undercut, a tidy short beard, warm confident city-pop cool",
        wear="an olive-green beanie and a charcoal denim jacket over a plum hoodie, a lilac accent",
        prop="a classic car key fob and a retro cassette tape"),
    "alex": dict(seed=1955, key="green",
        who="Alex, a calm ordinary adult White man in his late 20s",
        look="short brown hair, a calm steady quiet expression",
        wear="a slate-grey mountaineering fleece with a sky accent and a hiking watch",
        prop="a folded paper route map"),
    "tom": dict(seed=7330, key="green",
        who="Tom, a cheerful blond adult White man in his mid-20s",
        look="short tousled blond hair, a slightly fuller face, a joyful open expression",
        wear="a forest-green hoodie with a mint lining",
        prop="a handheld game console"),
    "sam": dict(seed=5001, key="green",
        who="Sam, a sporty adult White man in his mid-20s",
        look="short chestnut athletic hair, broad shoulders, a relaxed easy grin",
        wear="a forest-and-sage track jacket over a casual tee, a wristband",
        prop="a tennis racquet handle"),
    "francis": dict(seed=5002, key="green",
        who="Francis, a gentle adult White man in his late 20s",
        look="soft wavy sand-brown hair, NO glasses, a tender warm look",
        wear="a plum cardigan over a layered tee with a soft lilac scarf",
        prop="a warm tea cup"),
    "shin": dict(seed=5004, key="green",
        who="Shin, a clever warm adult East-Asian man in his late 20s",
        look="short neat black hair, round glasses, a warm clever smile",
        wear="a tidy navy overshirt with a sky-blue accent",
        prop="a notebook of kanji radicals"),
    "jodi": dict(seed=5005, key="green",
        who="Jodi, a warm older adult White woman in her late 50s",
        look="soft silver-streaked bobbed hair, a kind wistful expression",
        wear="a plum coat with a rose scarf",
        prop="an old notebook with a red bookmark thread"),
    "christian": dict(seed=5006, key="magenta",
        who="Christian, an earnest fit adult Black man in his late 20s",
        look="hair tied back in a neat ponytail, an earnest warm expression",
        wear="a slate athletic top with a sage towel over one shoulder",
        prop="a small portable desk fan"),
    "jenny": dict(seed=5007, key="green",
        who="Jenny, a warm cozy adult White woman in her late 20s",
        look="long rich auburn hair, a mint headband, a gentle caring smile",
        wear="a cozy rose knit cardigan",
        prop="knitting needles and a ball of yarn"),
    "robert": dict(seed=5008, key="green",
        who="Robert, a genial adult White man in his 30s",
        look="neat side-parted brown hair, square glasses, a good-humoured welcoming look",
        wear="a navy blazer over a neat collared shirt with a sand-coloured scarf",
        prop="a blank reservation notebook"),
    "mika": dict(seed=5009, key="green",
        who="Mika, a quiet gentle adult blond White/European man in his mid-20s",
        look="short soft blond hair, thin glasses, a shy thoughtful expression",
        wear="a sky-blue cardigan over a soft white blouse",
        prop="colour-coded language study tabs"),
    "sophie": dict(seed=5010, key="green",
        who="Sophie, a bright adult East-Asian woman of Chinese/Hong-Kong heritage in her mid-20s",
        look="long dark hair, NO glasses, a tidy quietly-confident expression, a small star sticker",
        wear="an indigo cardigan with a precise collar and a mint accent",
        prop="a colour-tabbed notebook and a capped pen"),
    "xingyu": dict(seed=5011, key="green",
        who="Xingyu, a cheerful adult East-Asian woman in her mid-20s",
        look="a short undercut, round glasses, a huge warm grin, bouncing energy, earbuds in",
        wear="a teal cardigan with a lilac accent",
        prop="a blank lyric notebook"),
    "angel": dict(seed=5012, key="green",
        who="Angel, an organised warm adult East/Southeast-Asian woman in her late 20s",
        look="long straight dark hair with a neat centre parting, a big genuine smile",
        wear="a navy top, sharp and tidy but approachable",
        prop="a slim laptop and a colour-coded planner"),
    "stasi": dict(seed=5013, key="green",
        who="Stasi, a bright creative adult woman in her mid-20s",
        look="vibrant red/auburn wavy shoulder-length hair, round glasses, a warm open smile",
        wear="a cosy knitted scarf over a jacket",
        prop="a sketch pad and pencil"),
    "ruparna": dict(seed=5014, key="green",
        who="Ruparna, a gentle bookish adult South-Asian woman in her late 20s",
        look="long dark hair, a gentle thoughtful observant expression",
        wear="a cozy charcoal knit sweater with a lilac accent",
        prop="a novel held close"),
    "pho": dict(seed=5015, key="green",
        who="Pho, a carefree young Southeast-Asian woman in her early 20s",
        look="long black hair, a relaxed carefree easy grin",
        wear="a warm mustard casual tee with a sand accent",
        prop="a bubble-tea cup"),
    "miller": dict(seed=6001, key="green",
        who="Miller, a crisp too-perfect adult businessman (an original 'textbook' archetype, NOT any real coursebook illustration)",
        look="neat side-parted blond hair, an uncannily polite neutral expression",
        wear="a clean navy suit with a sand tie",
        prop="a briefcase"),
    "tawapon": dict(seed=6002, key="green",
        who="Tawapon, a diligent cheerful adult international student (an original 'textbook' archetype, NOT any real coursebook illustration)",
        look="short black hair, a bright encouraging model-student expression",
        wear="a forest-and-mint sweater vest over a neat shirt, a satchel strap",
        prop="a textbook and a neat notebook"),
}

# The ten required expressions -> acting direction (eyes, brows, mouth, posture).
EXPR = {
    "neutral":    "a relaxed neutral class presence, faint warm smile, alive eyes toward the viewer",
    "happy":      "an open genuine happy smile, warm bright eyes, lifted cheeks",
    "laughing":   "laughing warmly, eyes crinkled, head tilted slightly back, shoulders relaxed",
    "thinking":   "thinking, eyes drifting aside and down, one brow active, a considering mouth",
    "surprised":  "pleasantly surprised, eyes widened, brows up, mouth slightly open",
    "concerned":  "gently concerned, brows drawn together softly, a caring worried mouth, leaning in",
    "determined": "quietly determined, focused steady eyes, a firm mouth, a slight forward lean",
    "embarrassed":"embarrassed, a shy flushed half-smile, eyes glancing away, shoulders drawn in",
    "speaking":   "mid-sentence speaking, mouth open in warm speech, expressive engaged eyes, one hand gesturing",
    "listening":  "listening attentively, a warm receptive half-smile, eyes on the speaker, head tilted to listen",
}


def bust_subject(c: dict, expr: str, with_prop: bool = True) -> str:
    prop = f" Holding {c['prop']}." if with_prop else ""
    return (f"Waist-up dialogue bust of {c['who']}. {c['look'].capitalize()}. "
            f"Wearing {c['wear']}.{prop} Expression: {EXPR[expr]}. "
            f"Front three-quarter view, eyes in the upper third, calm dialogue-safe lower crop.")


def sprite_subject(c: dict, expr: str) -> str:
    # Half-body stage sprite: solid opaque fabric, relaxed EMPTY hands (props are
    # separate assets — a held prop confuses flux into duplicate objects).
    return (f"Half-body VN character sprite of {c['who']}. {c['look'].capitalize()}. "
            f"Wearing {c['wear']} (solid opaque fabric, not sheer). Expression: {EXPR[expr]}. "
            f"Relaxed natural posture, empty hands, standing. Front three-quarter view, "
            f"head to mid-thigh, centered.")


def write(name: str, group: str, assets: list) -> None:
    os.makedirs(SPECS, exist_ok=True)
    with open(os.path.join(SPECS, name), "w") as f:
        json.dump({"group": group, "assets": assets}, f, indent=2)
    print(f"  {name}: {len(assets)} assets")


# ------------------------------------------------------------------- CHARACTERS
def characters_core():
    """All 21 cast: neutral+happy+thinking bust + neutral half-body sprite."""
    assets = []
    for cid, c in CAST.items():
        for expr in ("neutral", "happy", "thinking"):
            assets.append(dict(
                id=f"{cid}__bust__{expr}", type="bust",
                out=f"characters/{cid}/{cid}__bust__{expr}.webp",
                seed=c["seed"] + _h(expr) % 97, deliver=[1024, 1536],
                subject=bust_subject(c, expr),
                usage="VN dialogue portrait / roster card / study-link panel",
                runtime_home="src/academy/vn.ts portrait (raster path) + roster; replaces avatarSvg bust"))
        assets.append(dict(
            id=f"{cid}__sprite__neutral__halfbody", type="sprite", key=c["key"],
            out=f"characters/{cid}/{cid}__sprite__neutral__halfbody.png",
            seed=c["seed"], best_of=2, deliver_h=1600,
            subject=sprite_subject(c, "neutral"),
            usage="VN stage speaker sprite (left/right)",
            runtime_home="src/academy/app.ts campus speaker + VN stage (replaces production/*/halfbody)"))
    write("characters-core.json", "characters:core", assets)


def characters_expressions():
    """Tier B: the remaining 7 expressions as busts for every cast member."""
    assets = []
    rest = ["laughing", "surprised", "concerned", "determined", "embarrassed", "speaking", "listening"]
    for cid, c in CAST.items():
        for expr in rest:
            assets.append(dict(
                id=f"{cid}__bust__{expr}", type="bust",
                out=f"characters/{cid}/{cid}__bust__{expr}.webp",
                seed=c["seed"] + _h(expr) % 97, deliver=[1024, 1536],
                subject=bust_subject(c, expr),
                usage="VN dialogue expression variant",
                runtime_home="src/academy/vn.ts expression swap"))
    write("characters-expressions.json", "characters:expressions", assets)


def rie_expanded():
    """Rie: full expression bust set + work-location busts + expression sprites."""
    c = CAST["rie"]
    assets = []
    for expr in EXPR:  # all ten as busts (hero character)
        assets.append(dict(
            id=f"rie__bust__{expr}", type="bust",
            out=f"characters/rie/rie__bust__{expr}.webp",
            seed=c["seed"] + _h(expr) % 97, deliver=[1024, 1536],
            subject=bust_subject(c, expr),
            usage="Rie dialogue portrait (hero)", runtime_home="onboarding + VN (replaces rie-sensei.webp)"))
    # work-location busts (the running gag: Rie working a second job)
    works = {
        "konbini": "behind a late-night convenience-store counter, a warm tired smile, soft fluorescent light kept cool",
        "ramen": "behind a small ramen counter with a simple apron and rising steam, warm and delighted",
        "station": "at a quiet station kiosk in a light staff jacket, blue-hour platform light behind",
    }
    for wid, scene in works.items():
        assets.append(dict(
            id=f"rie__bust__work-{wid}", type="bust",
            out=f"characters/rie/rie__bust__work-{wid}.webp",
            seed=c["seed"] + 400 + _h(wid) % 50, deliver=[1024, 1536],
            subject=(f"Waist-up bust of {c['who']}, {scene}. {c['look'].capitalize()}. "
                     f"Warm tired-radiant expression, same face and hair as her classroom look. "
                     f"Front three-quarter view, dialogue-safe lower crop."),
            usage="Rie second-job running-gag scene", runtime_home="VN work-scene beats"))
    for expr in ("happy", "thinking", "concerned"):
        assets.append(dict(
            id=f"rie__sprite__{expr}__halfbody", type="sprite", key="green",
            out=f"characters/rie/rie__sprite__{expr}__halfbody.png",
            seed=c["seed"] + 700 + _h(expr) % 50, best_of=2, deliver_h=1600,
            subject=sprite_subject(c, expr),
            usage="Rie stage sprite expression", runtime_home="VN stage"))
    write("rie-expanded.json", "characters:rie-expanded", assets)


# ------------------------------------------------------------------ ENVIRONMENTS
# location -> (concrete place description, {state: state-specific light/weather})
LOC = {
    "classroom": ("an evening Japanese-class classroom: chalkboard, a teacher's desk with a moss-green thermos and a nearly finished worksheet, rows of chairs, a tall window",
                  "calm dialogue-safe lower-right foreground"),
    "quad": ("a grand-but-fictional neoclassical stone campus quad with a route-card bench, wide steps, a lit window, and a small Japanese-garden corner with a stone lantern",
             "calm dialogue-safe lower-centre foreground"),
    "library": ("a quiet campus library reading room: a quiet study table with an open notebook and a red bookmark thread, tall shelves, a window seat",
                "calm dialogue-safe lower-right foreground"),
    "language-lab": ("a neat human-scaled listening lab: a listening booth, headphones on the desk, a window; ordinary, never a sci-fi control deck",
                     "calm dialogue-safe lower-right foreground"),
    "kanji-garden": ("a small fictional campus garden: a stone marker, a low wooden bridge, a pond edge, forms and paths that make kanji feel spatial",
                     "calm dialogue-safe lower foreground"),
    "cafe": ("an after-class city cafe: a corner table with a folded coral route card, a warm window, quiet stools",
             "calm dialogue-safe lower-right foreground"),
    "ramen": ("a small ramen counter: bowls and rising steam, a simple counter with seats, a window; NO branded noren or readable menu",
              "calm dialogue-safe lower foreground"),
    "pub": ("a warm but quiet pub: a booth with empty seats showing there is room for someone, a coat hook, a window; no readable labels",
            "calm dialogue-safe lower-right foreground"),
    "station": ("a quiet commuter station: a platform edge, a blank departure board, a train that is not a branded model, a route card",
                "calm dialogue-safe lower-left foreground"),
    "street": ("a Bloomsbury-flavoured Georgian street: a planted square edge, a crossing, a warm window cafe, wet or dry pavement, a route card",
               "calm dialogue-safe lower-left foreground"),
    "home": ("a practical home study room: a desk with an open notebook and a red bookmark thread tucked into an ordinary life, a window",
             "calm dialogue-safe lower-right foreground"),
    "work": ("a generic shared work corner: a desk edge, a doorway, a route card; no employer name, no screens or data shown",
             "calm dialogue-safe lower-right foreground"),
    "japan-street": ("a later original Japanese street of eaves and warm windows: a covered entry, a puddle route, a paper lantern; recognizably a new place, never a copied Tokyo landmark",
                     "calm dialogue-safe lower foreground"),
    "japan-temple": ("a quiet original temple approach: a gate, stone steps, a stone lantern, distance and mist; no named shrine",
                     "calm dialogue-safe lower foreground"),
    "japan-ryokan": ("a warm original ryokan: a wooden veranda, an entry light, a hillside mountain view, a borrowed umbrella",
                     "calm dialogue-safe lower foreground"),
    "japan-shinkansen": ("an original high-speed-train platform: a train door, a platform edge, a blank departure board",
                         "calm dialogue-safe lower foreground"),
}
STATES = {
    "morning":  "morning: soft cool overcast sky key, restrained warm bounce, day-clear",
    "afternoon":"late afternoon: warmer low sun, longer soft shadows, still daylight",
    "evening":  "blue hour evening: indigo/teal sky, warm amber practical windows and lamps, long soft shadows",
    "rain":     "rain evening: wet reflective horizontal surfaces, amber practicals reflecting vertically, a visible warm dry refuge, quiet not stormy",
    "special":  "a warm special-event glow: gentle cool ambient with extra warm practical lanterns/string lights for a celebration, still calm and readable",
}


def env_asset(loc, place, safe, state, statedesc, view):
    w, h = (1600, 900) if view == "wide" else (900, 1125)
    return dict(
        id=f"{loc}__{state}__{view}", type="plate", w=w, h=h,
        out=f"environments/{loc}/{state}-{view}.webp",
        seed=(_h(loc) % 9000) + (_h(state) % 900) + (0 if view == "wide" else 1),
        subject=(f"{place}. Time/weather: {statedesc}. "
                 f"{'Wide 16:9 establishing plate.' if view=='wide' else 'Portrait 4:5 mobile companion keeping the focal landmark; not a crop of the wide plate.'} "
                 f"{safe}."),
        usage=f"{loc} {state} background",
        runtime_home=f"src/academy/app.ts environments/{loc}/{state}-{view}.webp")


def environments(states, name, group):
    assets = []
    for loc, (place, safe) in LOC.items():
        for state in states:
            for view in ("wide", "mobile"):
                assets.append(env_asset(loc, place, safe, state, STATES[state], view))
    write(name, group, assets)


# ------------------------------------------------------------------------ EVENTS
EVENTS = [
    ("prologue-notebook", "A quiet close story CG: an unfinished Japanese-study notebook open on a lamplit classroom desk beside a moss-green thermos, a red bookmark thread, evening blue-hour window behind. No people. The emotional 'the story begins here' beat."),
    ("name-circle", "A warm story CG of an adult evening Japanese class doing self-introductions in a blue-hour classroom, a diverse group of adult learners in a loose circle, one speaking, warm amber light; readable silhouettes, no readable text on any board."),
    ("konbini-midnight", "A tender story CG: a warm midnight convenience-store interior seen from a customer's side, a kind tired adult woman clerk at the till, cool fluorescent light warmed by the moment; quiet, human."),
    ("ramen-night", "A cosy story CG: an adult friend group around a small steamy ramen counter at night in the rain outside, warm amber counter light, bowls and steam; no branded noren, no readable menu."),
    ("okonomiyaki-night", "A warm story CG: adults gathered around a hot okonomiyaki griddle table, cheerful, steam and warm light, a rainy window behind."),
    ("pub-night", "A warm story CG: an evening pub booth of adult classmates raising simple unlabelled glasses, welcoming, empty seats showing room for one more; no readable labels."),
    ("library-two-hander", "A gentle emotional story CG: two adult classmates at a quiet library table sharing a quiet honest moment over an open notebook, soft window light, restrained and tender, not melodramatic."),
    ("kanji-garden-lesson", "A calm story CG: an adult teacher and a learner in a small campus garden, kanji-as-picture teaching using stones, a bridge, and reflections; petals and blue-hour calm."),
    ("surprise-party", "A warm special-event story CG: adult classmates setting up a small surprise celebration in a cafe with gentle string lights and a colour-coded plan on the table (no readable text), affectionate and busy."),
    ("airport-farewell", "A restrained bittersweet story CG: adult friends at an original airport departure glass at dawn, one leaving, quiet warmth, a blank last notebook page motif; understated, one nod says a lot."),
    ("class-group", "A warm ensemble story CG of the whole adult evening class together outside the campus at blue hour with cherry blossom and a stone lantern, everyone with a readable silhouette; the class-gift group portrait."),
]


def events():
    assets = []
    for eid, subj in EVENTS:
        for view in ("wide", "mobile"):
            w, h = (1600, 900) if view == "wide" else (900, 1125)
            assets.append(dict(
                id=f"{eid}__{view}", type="event", w=w, h=h,
                out=f"events/{eid}/{eid}-{view}.webp",
                seed=(_h(eid) % 9000) + (0 if view == "wide" else 1),
                subject=subj + (" Wide 16:9 CG." if view == "wide" else " Portrait 4:5 mobile CG keeping the focal beat."),
                usage=f"{eid} story event", runtime_home="src/academy/app.ts key-scenes"))
    write("events.json", "events", assets)


# ------------------------------------------------------------------------- PROPS
PROPS = [
    ("route-card", "green", "a folded coral route card, plain, no readable writing"),
    ("thermos", "magenta", "a slim moss-green vacuum-flask thermos"),
    ("door-tag", "green", "a small cobalt-blue door tag on a cord (a welcome token)"),
    ("pinned-card", "green", "a small blank card pinned by a brass pin (a noticeboard problem in object form), no text"),
    ("umbrella", "magenta", "a closed yellow-lined umbrella"),
    ("bookmark-thread", "green", "an old notebook with a red bookmark thread hanging out"),
    ("hana-maru", "green", "a red hand-drawn flower-circle hana-maru stamp mark on a small worksheet corner"),
    ("ramen-bowl", "green", "a steaming bowl of ramen with chopsticks, no branded elements"),
    ("okonomiyaki", "green", "a plate of okonomiyaki with a spatula"),
    ("bubble-tea", "green", "a bubble-tea cup with a wide straw"),
    ("knitting", "green", "a ball of yarn with two knitting needles and a half-finished scarf"),
    ("cassette", "green", "a retro cassette tape with a hand-lettered blank label, no readable text"),
    ("game-console", "green", "a generic handheld game console, no brand marks"),
    ("tennis-racquet", "green", "a tennis racquet leaning, no brand marks"),
    ("desk-fan", "green", "a small portable desk fan"),
    ("teacup", "green", "a warm cup of tea with faint steam"),
    ("worksheet-stack", "green", "a small stack of marked paper worksheets with red flower-circle marks, no readable text"),
    ("kanji-block", "green", "a single wooden block painted with one bold original brush-stroke kanji-like mark (decorative, not a real readable character)"),
]


def props():
    assets = []
    for pid, key, subj in PROPS:
        assets.append(dict(
            id=f"prop__{pid}", type="prop", key=key,
            out=f"props/{pid}.png",
            seed=_h(pid) % 9000, best_of=1, gen_h=768, deliver_h=768,
            subject=f"A clean single object: {subj}.",
            usage="item art / study reward / scene prop", runtime_home="src/academy/art.ts itemArtSvg raster replacement"))
    write("props.json", "props", assets)


# ------------------------------------------------------------------- PROTAGONIST
def protagonist():
    opts = [
        ("a", "a warm approachable adult learner of ambiguous gender, short dark hair, a soft neutral jacket, a notebook, gentle hopeful eyes"),
        ("b", "a quietly determined adult woman learner, medium brown hair, a simple cardigan, a curious warm expression"),
        ("c", "a friendly adult man learner, short hair, a plain hoodie, an open eager expression"),
        ("d", "an androgynous casual adult learner, cropped hair, a relaxed layered outfit, an easy calm expression"),
    ]
    assets = []
    for oid, look in opts:
        assets.append(dict(
            id=f"protagonist__{oid}__bust", type="bust",
            out=f"protagonist/protagonist-{oid}__bust.webp",
            seed=7700 + ord(oid), deliver=[1024, 1536],
            subject=(f"Waist-up dialogue bust of the player-character protagonist option {oid.upper()}: {look}. "
                     f"Front three-quarter view, warm blue-hour classroom blur, dialogue-safe lower crop. "
                     f"A relatable adult evening-class learner, not a hero."),
            usage="onboarding protagonist portrait choice", runtime_home="src/academy/app.ts onboarding portrait select"))
    write("protagonist.json", "protagonist", assets)


if __name__ == "__main__":
    print("writing specs ->", SPECS)
    characters_core()
    rie_expanded()
    environments(["evening", "rain"], "environments-a.json", "environments:a")
    events()
    props()
    protagonist()
    # Tier B (authored now, generate as throughput allows)
    characters_expressions()
    environments(["morning", "afternoon", "special"], "environments-b.json", "environments:b")
    print("done.")
