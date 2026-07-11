# Curriculum orders

The same canonical concepts can be taught in more than one valid order. Each order
is a topological sort of the prerequisite graph: a concept never appears before
something it depends on. Canonical data:
`public/academy/content/mappings/curriculum-orders.json`. The ordered set is the
grammar+function backbone; kanji, vocabulary, and skills attach to whichever
lesson first teaches the backbone concept they support.

## The four orders

**class-chronology** (default). The order the evening class actually teaches,
preserved by the encoded route: kana and survival repair, then identity and
particles, then past and te-form, then the N4 connective/state/preparation
cluster, ending on planning for a group. Matches the source archive. Trade-off:
から (an N5 point) and the productive te-form surface later than the textbooks
place them, because the class front-loads spoken survival.

**genki-textbook**. Re-sequenced to follow Genki I/II: the te-form and requests
move up to Genki L6, obligation to L12, potential to L13, then the L18
transitivity/てしまう cluster and the L21 ながら/てある cluster. Lets a Genki
self-studier slot in. Trade-off: teaches the te-form earlier than the class does.

**jlpt-exam-prep**. All N5-band grammar and functions before any N4 item, so an
N5 candidate finishes a self-contained block. Clean band boundary. Trade-off:
communicatively linked pieces — simultaneous actions and their reasons — get
split across the N5/N4 line.

**communicative-first**. Ordered by communicative priority, pulling each grammar
point in just before the function it serves: repair, greet, locate, shop, invite,
narrate, advise, then the N4 expressive cluster, ending on shared planning. Every
grammar item lands with an immediate use. Trade-off: grammar families such as the
te-form cluster are spread across several functions rather than taught together.

## Why the orders differ but stay valid

The prerequisite graph, not the lesson numbers, is what constrains order. Because
`grammar:nakereba-naranai` depends only on `grammar:past-polite` (not on
potential), the Genki order can teach obligation before potential the way Genki
does, while the class order teaches them together. Any sequence that respects the
graph is a legal order; these four are the pedagogically useful ones.

All four cover exactly the same 42-concept backbone (31 grammar + 11 function).
The validator confirms this:
if one order dropped or added a concept, or placed a prerequisite too late, it
fails.

## Choosing an order at runtime

`class-chronology` is the default and is what the encoded route delivers. The
others are provided for a learner arriving from a textbook, preparing for a
specific JLPT sitting, or learning for immediate use. Switching order does not
change what is taught, only the sequence.

## Validation

`node scripts/academy-curriculum/validate-orders.mjs` checks each order for
duplicate-free membership, prerequisite closure, topological validity, and — for
the base orders — identical coverage.
