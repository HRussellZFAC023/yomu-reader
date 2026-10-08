import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
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
        for (const key of [
            'interfaceLocalesReady',
            'interfaceLocaleRtlPending',
            'onboardingLanguage',
            'onboardingOutputLanguage',
            'onboardingTargetLanguage',
        ]) {
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
        expect(copyTierOf(legacyChromeMessageId('clearLocalDictionarySiteStorage'))).toMatchObject({
            tier: 'human-critical',
            category: 'destructive-actions',
            rule: 'destructive-and-irreversible',
        });
        expect(copyTierOf(legacyChromeMessageId('localDictionarySiteStorageHelp'))).toMatchObject({
            tier: 'machine-draft-ok',
            category: 'supplementary',
            rule: 'default-supplementary-copy',
        });
        for (const key of ['extensionSettingsRecoveryTitle', 'academyRecoveryCodeCreate', 'extensionDictionaryUnavailable', 'extensionDictionaryConnectionLost']) {
            expect(copyTierOf(legacyChromeMessageId(key))).toMatchObject({
                tier: 'human-critical',
                category: 'degraded-and-empty-states',
                rule: 'degraded-empty-and-unavailable-states',
            });
        }
        expect(COPY_TIER_RULE_NAMES.at(-1)).toBe('default-supplementary-copy');
    });

    it('lets low-stakes help and reference copy ship as a labelled machine draft', () => {
        // This is the policy, not an oversight: the alternative to a labelled
        // machine draft for a tooltip is no tooltip in that language at all.
        expect(copyTierOf(legacyChromeMessageId('furiganaDifficultKanjiHelp')).tier)
            .toBe('machine-draft-ok');
        for (const key of [
            'subtitleNativeDisplay',
            'subtitleNativeDisplayBlurred',
            'subtitleNativeDisplayShown',
            'subtitleNativeDisplayHidden',
            'subtitleNativeBlurStrength',
        ]) {
            expect(copyTierOf(legacyChromeMessageId(key))).toMatchObject({
                tier: 'machine-draft-ok',
                category: 'supplementary',
                rule: 'default-supplementary-copy',
            });
        }
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

    it('keeps toast copy behind stable IDs instead of raw English errors', () => {
        const readerRoot = resolve('src/reader');
        const offenders: string[] = [];
        for (const file of typescriptFiles(readerRoot)) {
            const source = ts.createSourceFile(
                file,
                readFileSync(file, 'utf8'),
                ts.ScriptTarget.Latest,
                true,
                ts.ScriptKind.TS,
            );
            const visit = (node: ts.Node): void => {
                if (ts.isCallExpression(node) && calledName(node.expression) === 'toast') {
                    const reason = unsafeToastCopy(node.arguments[0]);
                    if (reason) {
                        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
                        offenders.push(`${relative(process.cwd(), file)}:${position.line + 1} ${reason}`);
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }

        expect(offenders).toEqual([]);
    });

    // Pin ID-based classification too: source-text escalation cannot catch its removal.
    it('keeps every tier rule, and the tier split, where it was measured', () => {
        expect(COPY_TIER_RULE_NAMES).toHaveLength(10);

        const messages = registerChromeMessages(chromeMessageSource());
        const humanCritical = messages.filter((message) => message.tier === 'human-critical');
        const byIdAlone = humanCritical.filter((message) => copyTierOf(message.id).tier === 'human-critical');
        expect({ total: messages.length, critical: humanCritical.length, byId: byIdAlone.length })
            .toEqual({ total: 1206, critical: 413, byId: 407 });
        // Japanese-only/setup/settings removal changed the message inventory;
        // all ten classification rules and surviving critical keys remain pinned.
        // The Settings launcher gained one help line and "Open in Study"; the
        // reading-state control's old-vocabulary toasts and the toolbar popup's
        // unused heading went, and audio is named by its state
        // (autoplayAudioOn/Off, still human-critical). The "Dim page behind
        // popover" setting went with the page dim.
        for (const key of ['backupMovedHelp', 'helpLinksCopy', 'extensionSettingsRecoveryGuidance', 'dictionaryImportHelp', 'yomitanSettingsInvalid']) {
            expect(chromeMessageSource()).not.toHaveProperty(key);
        }
        for (const key of ['gradeAgainLabel', 'gradeGoodLabel', 'settingsImportUnsupportedFormat', 'settingsImportIncomplete',
            ...Object.keys(chromeMessageSource()).filter(key => key.startsWith('practice'))]) {
            expect(copyTierOf(legacyChromeMessageId(key)).tier).toBe('human-critical');
        }
        for (const key of ['bunproGradeAgainLabel', 'bunproGradeHardLabel', 'bunproGradeGoodLabel', 'bunproGradeEasyLabel']) {
            expect(chromeMessageSource()).not.toHaveProperty(key);
        }

        expect(humanCritical.length - byIdAlone.length).toBe(6);
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

function typescriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return typescriptFiles(path);
        return entry.isFile() && path.endsWith('.ts') ? [path] : [];
    });
}

function calledName(expression: ts.Expression): string | undefined {
    if (ts.isIdentifier(expression)) return expression.text;
    if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
    return undefined;
}

function unsafeToastCopy(expression: ts.Expression | undefined): string | undefined {
    if (!expression) return undefined;
    if (ts.isParenthesizedExpression(expression)) return unsafeToastCopy(expression.expression);
    if (ts.isStringLiteralLike(expression) && /[A-Za-z]{2}/.test(expression.text)) {
        return `raw English literal: ${JSON.stringify(expression.text)}`;
    }
    if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'message') {
        return 'Error.message bypasses localized copy';
    }
    if (ts.isConditionalExpression(expression)) {
        return unsafeToastCopy(expression.whenTrue) ?? unsafeToastCopy(expression.whenFalse);
    }
    if (ts.isBinaryExpression(expression)) {
        return unsafeToastCopy(expression.left) ?? unsafeToastCopy(expression.right);
    }
    if (ts.isCallExpression(expression)) {
        const name = calledName(expression.expression);
        if (name === 'errorMessage') return 'errorMessage bypasses localized copy';
        if (name === 'uiText'
            || name === 'formatUiText'
            || name === 'subtitleText'
            || name === 'formatSubtitleText'
            || name === 'newTabText'
            || name === 'userFacingErrorText'
            || name === 'text') {
            return undefined;
        }
    }
    return undefined;
}
