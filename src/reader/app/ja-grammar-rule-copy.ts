import { DOCS_BASE_URL } from './constants';
import type { GrammarRuleCopy } from './i18n';
import { requestJson } from '../network/http';

// The Japanese explanations of grammar rules are hosted data, not UI copy:
// fetched once per page when a Japanese interface first asks for one.
const JA_GRAMMAR_RULE_COPY_URL = `${DOCS_BASE_URL}data/ja-grammar-rule-copy.json`;
let jaGrammarRuleCopyPromise: Promise<Record<string, GrammarRuleCopy>> | undefined;

// Test seam: lets tests re-run the copy load against fresh request stubs
// without vi.resetModules(), whose cold re-import of this module's graph
// races the test timeout on loaded CI runners. Tree-shaken from builds.
export function resetJaGrammarRuleCopyCacheForTests(): void {
    jaGrammarRuleCopyPromise = undefined;
}

/** Every rule's Japanese copy; empty when the hosted data cannot be read (a later call retries). */
export async function loadJaGrammarRuleCopy(): Promise<Record<string, GrammarRuleCopy>> {
    jaGrammarRuleCopyPromise ??= requestJson(JA_GRAMMAR_RULE_COPY_URL, {
        failureLabel: 'Japanese grammar copy request',
        timeoutMs: 15000,
        allowDirectCrossOrigin: true,
        credentials: 'omit',
        anonymous: true,
    })
        .then(normalizeGrammarRuleCopy)
        .catch(() => {
            jaGrammarRuleCopyPromise = undefined;
            return {};
        });
    return jaGrammarRuleCopyPromise;
}

function normalizeGrammarRuleCopy(value: unknown): Record<string, GrammarRuleCopy> {
    if (!isGrammarRuleCopyRecord(value)) return {};
    const copy: Record<string, GrammarRuleCopy> = {};
    for (const [ruleId, item] of Object.entries(value)) {
        const ruleCopy = normalizeGrammarRuleCopyItem(item);
        if (!ruleCopy) continue;
        copy[ruleId] = ruleCopy;
    }
    return copy;
}
function normalizeGrammarRuleCopyItem(value: unknown): GrammarRuleCopy | null {
    if (!isGrammarRuleCopyRecord(value)) return null;
    const kind = grammarRuleCopyText(value.kind);
    const short = grammarRuleCopyText(value.short);
    const detail = grammarRuleCopyText(value.detail);
    if (kind === undefined || short === undefined || detail === undefined) return null;
    return { kind, short, detail };
}
function grammarRuleCopyText(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }

function isGrammarRuleCopyRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
