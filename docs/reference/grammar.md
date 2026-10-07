---
title: Grammar coverage
description: See what Yomu's local Japanese grammar detection covers and the source it was checked against.
---

# Grammar coverage

The Grammar card always stays visible after a check. A local match shows the
pattern and its JLPT level. Detection is deliberately narrow: a match
is a prompt to inspect the sentence, not a complete parse.

## Current coverage

Yomu reads Japanese only, so there is one inventory: [Tofugu Japanese Grammar](https://www.tofugu.com/japanese-grammar/) is the checked source for its 307 local rules with JLPT levels.

Yomu bundles only small detector patterns. The linked source defines
the construction names and scope; it is not copied
into the bundle. A broader unreviewed regex would create false grammar teaching,
so new coverage grows through checked examples and adversarial near-negatives.
