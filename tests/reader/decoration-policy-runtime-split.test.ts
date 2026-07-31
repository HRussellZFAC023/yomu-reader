import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as decorationPolicy from '../../src/reader/dom/decoration-policy';
import {
    decorationPolicyRuntimeApi,
    registerDecorationPolicyRuntimeApi,
} from '../../src/reader/dom/decoration-policy-runtime-bridge';

const DECORATION_POLICY_RUNTIME_API_SLOT = Symbol.for('yomu.decoration-policy-runtime-api.v1');
const originalRuntimeSlot = Object.getOwnPropertyDescriptor(globalThis, DECORATION_POLICY_RUNTIME_API_SLOT);
const repoRoot = path.resolve(import.meta.dirname, '..', '..');

describe('aggregate runtime decoration-policy split', () => {
    afterEach(() => {
        if (originalRuntimeSlot) {
            Object.defineProperty(globalThis, DECORATION_POLICY_RUNTIME_API_SLOT, originalRuntimeSlot);
        } else {
            Reflect.deleteProperty(globalThis, DECORATION_POLICY_RUNTIME_API_SLOT);
        }
    });

    it('shares the exact policy implementation through one non-enumerable sandbox slot', () => {
        registerDecorationPolicyRuntimeApi(decorationPolicy);

        expect(decorationPolicyRuntimeApi()).toBe(decorationPolicy);
        expect(Object.getOwnPropertyDescriptor(globalThis, DECORATION_POLICY_RUNTIME_API_SLOT)).toMatchObject({
            enumerable: false,
        });
    });

    it('fails closed when the required runtime did not install the policy', () => {
        Reflect.deleteProperty(globalThis, DECORATION_POLICY_RUNTIME_API_SLOT);

        expect(() => decorationPolicyRuntimeApi()).toThrow('decoration-policy runtime is not installed');
    });

    it('keeps the bridge out of the page-cloned companion registry', () => {
        const bridge = readFileSync(
            path.join(repoRoot, 'src/reader/dom/decoration-policy-runtime-bridge.ts'),
            'utf8',
        );
        expect(bridge).toContain("Symbol.for('yomu.decoration-policy-runtime-api.v1')");
        expect(bridge).not.toContain('__yomuCompanions');
        expect(bridge).not.toContain('cloneInto');
        expect(bridge).not.toMatch(/\bwindow\b/u);
    });

    it('registers the policy in the aggregate runtime and aliases only the split core', () => {
        const buildRegistry = readFileSync(
            path.join(repoRoot, 'src/reader/companions/register-build-companions.ts'),
            'utf8',
        );
        const viteConfig = readFileSync(path.join(repoRoot, 'vite.config.ts'), 'utf8');

        expect(buildRegistry).toContain("import '../dom/register-decoration-policy-runtime';");
        expect(viteConfig).toContain("alias['./decoration-policy']");
        expect(viteConfig).toContain("'decoration-policy-companion.ts'");
    });

    it('keeps mutable policy state on the shared implementation', () => {
        const predicate = vi.fn(() => true);
        registerDecorationPolicyRuntimeApi(decorationPolicy);

        decorationPolicyRuntimeApi().setReviewCardFrontPredicate(predicate);
        const element = document.createElement('div');
        expect(decorationPolicyRuntimeApi().classifyDecoration(element)).toBe('skip');
        expect(predicate).toHaveBeenCalledWith(element);

        decorationPolicy.setReviewCardFrontPredicate(null);
    });
});
