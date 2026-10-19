// Selectors with what Chromium does with them beside a host `body:has(.flag) .target`
// rule: `wholeSubtree` when one host text insertion makes it invalidate every
// element under BODY. The check:css-has gate must refuse exactly these, even with
// an allow comment (tests/reader/css-has-invalidation.test.ts), and
// scripts/css-has-invalidation-smoke.mjs re-measures every row in Chromium.
// Rows include each form a W1-40 review found the gate misreading.
export const HAS_GATE_PROBES = [
    // A bare or bare-alternative subject after a child/descendant combinator.
    { selector: '.p:has(.i) > *', wholeSubtree: true },
    { selector: '.p:has(.i)>*', wholeSubtree: true },
    { selector: '.p:has(.i) > :not(.x)', wholeSubtree: true },
    { selector: '.p:has(.i) > :not(:not(.k))', wholeSubtree: true },
    { selector: '.p:has(.i) > :is(*, .k)', wholeSubtree: true },
    { selector: '.p:has(.i) > :where(.k, :hover)', wholeSubtree: true },
    { selector: '.p:has(.i) > :is(.k, :not(.x))', wholeSubtree: true },
    { selector: '.p:has(.i) > :is(.a > *, .k)', wholeSubtree: true },
    { selector: '.p:has(.i) > :nth-child(2n of *, .k)', wholeSubtree: true },
    { selector: '.p:has(.i) > * + *', wholeSubtree: true },
    { selector: '.p:has(.i) > * ~ *', wholeSubtree: true },
    { selector: ':is(.p:has(.i)) > *', wholeSubtree: true },
    { selector: ':is(.p:has(.i) > :not(.x))', wholeSubtree: true },
    { selector: ':not(.p:has(.i) > *)', wholeSubtree: true },
    { selector: '.x :is(.p:has(.i) > *)', wholeSubtree: true },
    // A compound around the :is() does not key the subject inside it.
    { selector: ':is(.p:has(.i) > *).k', wholeSubtree: true },
    { selector: '.k:is(.p:has(.i) > *)', wholeSubtree: true },
    { selector: 'rt:is(.p:has(.i) > *)', wholeSubtree: true },
    { selector: ':is(.p:has(.i) > *)[data-k]', wholeSubtree: true },
    { selector: ':where(.p:has(.i) > *).k', wholeSubtree: true },
    { selector: ':is(:is(.p:has(.i) > *)).k', wholeSubtree: true },
    { selector: ':is(.p:has(.i) > :is(*)).k', wholeSubtree: true },
    { selector: ':nth-child(2n of .p:has(.i) > *).k', wholeSubtree: true },
    // The outermost subject decides.
    { selector: ':is(.p:has(.i) > .k) > *', wholeSubtree: true },
    { selector: ':is(.p:has(.i) > .k) + *', wholeSubtree: true },
    { selector: ':is(.p:has(.i) > *) + *', wholeSubtree: true },
    // Strings and escapes.
    { selector: '.p[data-label="("]:has(.i) > :not(.x)', wholeSubtree: true },
    { selector: '.p:h\\61 s(.i) > :not(.x)', wholeSubtree: true },
    { selector: '.p:\\68 as(.i) > *', wholeSubtree: true },
    { selector: '.p:HAS(.i) > *', wholeSubtree: true },
    { selector: '.\\70 :\\000068 as(.i) *', wholeSubtree: true },
    // Keyed subjects.
    { selector: '.p:has(.i) > .k', wholeSubtree: false },
    { selector: '.p:has(.i) > :is(rt, .k)', wholeSubtree: false },
    { selector: '.p:has(.i) > :is(.k, :where(rt, .x))', wholeSubtree: false },
    { selector: '.p:has(.i) > :is(.a > .b, .k)', wholeSubtree: false },
    { selector: '.p:has(.i) > * > .k', wholeSubtree: false },
    { selector: '.p:has(.i) > * + .k', wholeSubtree: false },
    { selector: '.p:has(.i) > \\2a', wholeSubtree: false },
    { selector: '.p:has(.i) > :is(.k, \\2a)', wholeSubtree: false },
    { selector: ':is(.p:has(.i) > .k)', wholeSubtree: false },
    { selector: ':is(.p:has(.i) > *.k)', wholeSubtree: false },
    { selector: ':is(.p:has(.i)) > .k', wholeSubtree: false },
    { selector: ':not(.p:has(.i) > .k)', wholeSubtree: false },
    { selector: ':is(.p:has(.i) > *) > .k', wholeSubtree: false },
    { selector: ':is(.p:has(.i) > *) .k', wholeSubtree: false },
    { selector: ':is(.p:has(.i) > *) + .k', wholeSubtree: false },
    { selector: ':is(.p:has(.i) > *, .y) .k', wholeSubtree: false },
    { selector: ':not(.p:has(.i) > *) .k', wholeSubtree: false },
    // A sibling combinator straight after the :has() reaches only the anchor's siblings.
    { selector: '.p:has(.i) + *', wholeSubtree: false },
    { selector: '.p:has(.i) ~ *', wholeSubtree: false },
    { selector: '.p:has(.i) + * > *', wholeSubtree: false },
    { selector: '.p:has(.i) ~ * *', wholeSubtree: false },
    { selector: ':is(.p:has(.i)) + *', wholeSubtree: false },
    { selector: ':is(.p:has(.i) + *) > *', wholeSubtree: false },
    { selector: '.x:is(.p:has(.i) + *)', wholeSubtree: false },
];

// Complete rules, for what one selector prelude cannot hold: CSS nesting and
// @scope. The gate does not resolve `&` or scoping roots, so it refuses every
// row here, even with an allow comment; `wholeSubtree` is what Chromium does.
// The keyed rows show the refusal is stricter than Chromium needs: flattened,
// `.p:has(.i) .k` is allowed.
export const HAS_GATE_RULE_PROBES = [
    { rule: '.p { &:has(.i) > * { outline: 0; } }', wholeSubtree: true },
    { rule: '.p:has(.i) { > * { outline: 0; } }', wholeSubtree: true },
    { rule: '@scope (.p:has(.i)) { * { outline: 0; } }', wholeSubtree: true },
    { rule: '@scope (.p:has(.i)) { :scope > * { outline: 0; } }', wholeSubtree: true },
    { rule: '@scope (.p) to (.q:has(.i)) { * { outline: 0; } }', wholeSubtree: true },
    { rule: '@media all { .p { &:has(.i) > * { outline: 0; } } }', wholeSubtree: true },
    { rule: '.p:has(.i) { .k { outline: 0; } }', wholeSubtree: false },
    { rule: '@scope (.p:has(.i)) { .k { outline: 0; } }', wholeSubtree: false },
];
