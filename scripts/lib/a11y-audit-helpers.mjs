export const WCAG_AUDIT_TAGS = [
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
    'wcag22aa',
    'best-practice',
];

export function summarizeAxeViolations(violations, { nodeLimit, summarizeNode }) {
    return violations
        .filter(violation => violation.impact !== 'minor')
        .map(violation => ({
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.slice(0, nodeLimit).map(summarizeNode),
        }));
}
