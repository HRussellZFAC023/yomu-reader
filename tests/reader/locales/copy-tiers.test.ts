import { describe, expect, it } from 'vitest';
import { chromeMessageSource } from '../../../src/reader/app/i18n';
import {
    COPY_TIER_RULE_NAMES,
    HUMAN_TIER_ESCALATION_PHRASES,
    copyTierOf,
    escalatesToHumanTier,
    isMessageId,
    legacyChromeMessageId,
    legacyDocsMessageId,
    registerChromeMessages,
    registerSetupMessages,
    setupMessageIds,
} from '../../../src/reader/locales';

describe('D43 copy tiers are a property of the string', () => {
    it('classifies every registered message ID with no unclassified remainder', () => {
        const registered = [...registerChromeMessages(chromeMessageSource()), ...registerSetupMessages()];

        expect(registered.length).toBeGreaterThan(1_200);
        for (const message of registered) {
            expect(isMessageId(message.id), message.id).toBe(true);
            expect(['human-critical', 'machine-draft-ok']).toContain(message.tier);
        }
    });

    it('puts every first-run and language-picker string in the human tier', () => {
        for (const id of setupMessageIds()) {
            expect(copyTierOf(id).tier, id).toBe('human-critical');
        }
        for (const key of ['interfaceLocalesReady', 'interfaceLocaleRtlPending', 'onboardingLanguage']) {
            expect(copyTierOf(legacyChromeMessageId(key)).tier, key).toBe('human-critical');
        }
    });

    it('reports which rule decided, so a surprising tier is traceable', () => {
        expect(copyTierOf(legacyChromeMessageId('deleteAllCards'))).toMatchObject({
            tier: 'human-critical',
            category: 'destructive-actions',
            rule: 'destructive-and-irreversible',
        });
        expect(copyTierOf(legacyChromeMessageId('apiKey'))).toMatchObject({
            category: 'privacy-and-credentials',
        });
        expect(copyTierOf(legacyChromeMessageId('gradeGood'))).toMatchObject({
            category: 'study-loop',
        });
        expect(COPY_TIER_RULE_NAMES.at(-1)).toBe('default-supplementary-copy');
    });

    it('lets low-stakes help and reference copy ship as a labelled machine draft', () => {
        // This is the policy, not an oversight: the alternative to a labelled
        // machine draft for a tooltip is no tooltip in that language at all.
        expect(copyTierOf(legacyChromeMessageId('furiganaDifficultKanjiHelp')).tier)
            .toBe('machine-draft-ok');
    });

    it('escalates any default-tier string whose English text can cost a learner something', () => {
        // The safety net. A string named innocuously — `pruneTail`, `tidyUp` —
        // that tells a learner their data will be overwritten is human tier.
        const escalated = copyTierOf(legacyChromeMessageId('pruneTail'), 'This cannot be undone.');

        expect(escalated.tier).toBe('human-critical');
        expect(escalated.rule).toBe('escalated-by-source-text');
        expect(escalatesToHumanTier('Sends the sentence to Google Translate')).toBe(false);
        expect(escalatesToHumanTier('Your data is sent to the proxy')).toBe(true);
    });

    it('leaves no machine-draft-ok chrome string containing a high-stakes phrase', () => {
        // Adversarial check on the default rule: if this ever fails, a string
        // that can cost a learner data or money is sitting in the tier that may
        // ship as raw machine output.
        const offenders = registerChromeMessages(chromeMessageSource())
            .filter((message) => message.tier === 'machine-draft-ok')
            .filter((message) => escalatesToHumanTier(message.sourceText))
            .map((message) => message.id);

        expect(offenders).toEqual([]);
        expect(HUMAN_TIER_ESCALATION_PHRASES).toContain('cannot be undone');
    });

    it('gives hosted-docs prose a stable ID that moves when the prose is edited', () => {
        // The docs map is keyed by the English source string, so a comma edit
        // orphans the Japanese translation silently. A content-addressed ID turns
        // that into a reported missing translation instead.
        const original = legacyDocsMessageId('Make Japanese text tappable.');

        expect(isMessageId(original)).toBe(true);
        expect(legacyDocsMessageId('  Make Japanese text tappable.  ')).toBe(original);
        expect(legacyDocsMessageId('Make Japanese text tappable!')).not.toBe(original);
    });
});
