#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';

const baseUrl = process.env.ACADEMY_BASE_URL ?? 'http://127.0.0.1:5205';
const artifactDir = path.resolve('artifacts/academy-account-lifecycle/browser');
const viewports = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 800 },
];

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, locale: 'en-GB' });
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => {
            if (message.type() === 'error') errors.push(`console: ${message.text()}`);
        });
        page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));

        const response = await page.goto(`${baseUrl}/academy/content/RESOURCE-LEDGER.json`, {
            waitUntil: 'domcontentloaded',
        });
        assert.equal(response?.ok(), true, `Academy dev server is not reachable at ${baseUrl}`);
        await page.evaluate(async () => {
            document.body.replaceChildren();
            await import('/src/academy/entrypoint.ts');
            const { renderProfileSyncScreen } = await import('/src/academy/ui/profile-sync-screen.ts');
            const screen = renderProfileSyncScreen({
                language: 'en',
                status: {
                    phase: 'ready',
                    profile: {
                        profileId: '11111111-1111-4111-8111-111111111111',
                        accountId: '22222222-2222-4222-8222-222222222222',
                        deviceId: '33333333-3333-4333-8333-333333333333',
                        keyVersion: 1,
                        keyInitialized: true,
                    },
                    account: {
                        accountId: '22222222-2222-4222-8222-222222222222',
                        identity: { provider: 'google', label: 'Google account' },
                        displayName: 'Lifecycle learner',
                        boardVisible: true,
                        shareAvatar: false,
                        portraitId: null,
                        classes: [{ classId: 'class-proof', name: 'Proof class', role: 'learner' }],
                    },
                    entitlement: {
                        entitlement: 'academy',
                        state: 'active',
                        amountPence: 500,
                        fulfilledAt: Date.now(),
                        redeemedAt: Date.now(),
                    },
                    pending: 0,
                    lastSyncAt: Date.now(),
                    error: null,
                },
                onBack() {},
                async onConnect() {},
                async onRetry() {},
                onGoogleLink() {},
                async onStartPairing() {
                    return { pairingId: crypto.randomUUID(), code: 'PAIR-2026', expiresAt: Date.now() + 60_000 };
                },
                async onClaimPairing() {},
                async onExport() {},
                async onSignOut() {},
                async onDelete() {},
                onClassBoard() {},
            });
            document.body.replaceChildren(screen);
        });

        const screen = page.locator('.academy-profile-sync-screen');
        await screen.waitFor();
        const labels = await screen.locator('button').allTextContents();
        assert.ok(labels.includes('Delete cloud learning data'), 'profile reset control is missing');
        assert.ok(labels.includes('Delete account'), 'account deletion control is missing');

        const geometry = await screen.evaluate(element => {
            const controls = [...element.querySelectorAll('.academy-profile-sync-actions button')].map(button => {
                const rect = button.getBoundingClientRect();
                return {
                    text: button.textContent?.trim() ?? '',
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height,
                    textFits: button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1,
                };
            }).filter(control => control.width > 0 && control.height > 0);
            const overlaps = [];
            for (let left = 0; left < controls.length; left += 1) {
                for (let right = left + 1; right < controls.length; right += 1) {
                    const a = controls[left];
                    const b = controls[right];
                    const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                    const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                    if (overlapWidth > 1 && overlapHeight > 1) overlaps.push([a.text, b.text]);
                }
            }
            return { controls, overlaps, viewportWidth: innerWidth };
        });
        const undersized = geometry.controls.filter(control => control.width < 44 || control.height < 44);
        assert.ok(undersized.length === 0, `lifecycle controls must remain 44px targets: ${JSON.stringify(undersized)}`);
        assert.ok(geometry.controls.every(control => control.left >= 0 && control.right <= geometry.viewportWidth + 1), 'lifecycle controls must stay inside the viewport');
        assert.ok(geometry.controls.every(control => control.textFits), 'lifecycle control text must fit');
        assert.deepEqual(geometry.overlaps, [], 'lifecycle controls must not overlap');

        const axe = await new AxeBuilder({ page }).include('.academy-profile-sync-screen').analyze();
        const blocking = axe.violations.filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
        assert.deepEqual(blocking.map(violation => violation.id), []);
        assert.deepEqual(errors, []);
        await page.screenshot({
            path: path.join(artifactDir, `${viewport.name}-profile-lifecycle.png`),
            fullPage: true,
        });
        console.log(JSON.stringify({ viewport: viewport.name, controls: geometry.controls.length, axeBlocking: 0 }));
        await context.close();
    }
} finally {
    await browser.close();
}
