#!/usr/bin/env node
// D43 — the one extraction/coverage command for Yomu's localisation.
//
// Yomu had three localisation systems and no way to ask a single question of all
// three. This prints, from the real source rather than from a hand-kept tally:
//
//   * the message-ID inventory per namespace,
//   * how each ID is classified into a copy tier, and by which rule,
//   * per-locale coverage of the human-critical tier and the machine-draft tier,
//   * and whether every claim in config/multilingual/interface-locales.json holds.
//
//   node scripts/locale-report.mjs            # human-readable report
//   node scripts/locale-report.mjs --json     # the same numbers as JSON
//   node scripts/locale-report.mjs --check    # exit 1 if a ledger row is wrong
//
// It is deliberately a report, not a translator: generating machine drafts is a
// separate, reviewable step whose output lands in a catalogue file with an owner.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

// The reader modules expect a DOM at import time. Same approach as
// scripts/settings-reference.mjs, and for the same reason.
function installBrowserGlobals() {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://yomureader.com/' });
    window.matchMedia = () => ({ matches: false, media: '', onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
    globalThis.window = window;
    globalThis.self = window;
    for (const name of Object.getOwnPropertyNames(window)) {
        if (name in globalThis) continue;
        try { globalThis[name] = window[name]; } catch { /* a few jsdom properties refuse a plain copy */ }
    }
}

async function loadLocaleApi() {
    const workDir = mkdtempSync(path.join(tmpdir(), 'yomu-locale-report-'));
    try {
        const entry = path.join(workDir, 'entry.ts');
        const bundle = path.join(workDir, 'bundle.mjs');
        const source = file => JSON.stringify(path.join(ROOT, file));
        writeFileSync(entry, `
            import * as locales from ${source('src/reader/locales/index.ts')};
            import { chromeMessageSource, chromeMessageSourceForLocale } from ${source('src/reader/app/i18n.ts')};
            (globalThis as any).__yomuLocales = { locales, chromeMessageSource, chromeMessageSourceForLocale };
        `);
        await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: bundle, logLevel: 'silent' });
        installBrowserGlobals();
        await import(bundle);
        return globalThis.__yomuLocales;
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

function packFor(api, locale) {
    const { legacyChromeMessageId, setupPackFor } = api.locales;
    const chrome = (locale.tag === 'en' || locale.tag === 'ja')
        ? Object.fromEntries(Object.entries(api.chromeMessageSourceForLocale(locale.tag))
            .map(([key, value]) => [legacyChromeMessageId(key), value]))
        : {};
    return { ...chrome, ...(setupPackFor(locale.tag) ?? {}) };
}

export async function localeReport() {
    const api = await loadLocaleApi();
    const {
        INTERFACE_LOCALES, RTL_GATE_ITEMS, copyTierOf, measureLocaleCoverage,
        registerChromeMessages, registerSetupMessages, rtlGatePasses,
    } = api.locales;

    const registry = [...registerChromeMessages(api.chromeMessageSource()), ...registerSetupMessages()];
    const byRule = new Map();
    // The strings whose ID lied about their stakes. Worth naming: each one is a
    // case where the ID-based rules would have shipped raw machine output for
    // copy that can cost a learner something, and the source-text net caught it.
    const escalated = [];
    for (const message of registry) {
        const decision = copyTierOf(message.id, message.sourceText);
        if (decision.rule === 'escalated-by-source-text') escalated.push(decision.id);
        const bucket = byRule.get(decision.rule) ?? { rule: decision.rule, category: decision.category, tier: decision.tier, count: 0 };
        bucket.count += 1;
        byRule.set(decision.rule, bucket);
    }

    const locales = INTERFACE_LOCALES.map(locale => {
        const coverage = measureLocaleCoverage(locale.tag, registry, packFor(api, locale));
        return {
            tag: locale.tag,
            id: locale.id,
            englishName: locale.englishName,
            direction: locale.direction,
            reviewStatus: locale.reviewStatus,
            available: locale.available,
            blockers: [...locale.blockers],
            ...coverage,
            ledgerAgrees: coverage.complete === locale.available,
        };
    });

    return {
        totals: {
            locales: locales.length,
            available: locales.filter(locale => locale.available).length,
            messages: registry.length,
            humanCritical: registry.filter(message => message.tier === 'human-critical').length,
            machineDraftOk: registry.filter(message => message.tier === 'machine-draft-ok').length,
        },
        tiers: [...byRule.values()].sort((left, right) => right.count - left.count),
        escalated,
        locales,
        rtlGate: {
            passes: rtlGatePasses(),
            done: RTL_GATE_ITEMS.filter(item => item.done).map(item => item.id),
            outstanding: RTL_GATE_ITEMS.filter(item => !item.done).map(item => item.id),
        },
        disagreements: locales.filter(locale => !locale.ledgerAgrees).map(locale => locale.tag),
    };
}

function percent(part, whole) {
    return whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`;
}

async function main() {
    const report = await localeReport();
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        const { totals } = report;
        process.stdout.write(`Interface locales: ${totals.available} available of ${totals.locales}\n`);
        process.stdout.write(`Message IDs: ${totals.messages} (${totals.humanCritical} human-critical, ${totals.machineDraftOk} machine-draft-ok)\n\n`);
        process.stdout.write('Copy tiers by rule\n');
        for (const tier of report.tiers) {
            process.stdout.write(`  ${String(tier.count).padStart(5)}  ${tier.tier.padEnd(16)} ${tier.rule}\n`);
        }
        if (report.escalated.length) {
            process.stdout.write('\nPulled into the human tier by their English text, not their ID\n');
            for (const id of report.escalated) process.stdout.write(`  ${id}\n`);
        }
        process.stdout.write('\nPer-locale coverage\n');
        for (const locale of report.locales) {
            const human = `${locale.humanCriticalTranslated}/${locale.humanCriticalTotal} (${percent(locale.humanCriticalTranslated, locale.humanCriticalTotal)})`;
            const state = locale.available ? 'available' : locale.blockers[0] ?? 'blocked';
            process.stdout.write(`  ${locale.tag.padEnd(8)} ${locale.direction}  human-critical ${human.padEnd(18)} ${state}\n`);
        }
        process.stdout.write(`\nRTL gate: ${report.rtlGate.passes ? 'passes' : 'does not pass'}`);
        process.stdout.write(`\n  done:        ${report.rtlGate.done.join(', ') || 'none'}`);
        process.stdout.write(`\n  outstanding: ${report.rtlGate.outstanding.join(', ') || 'none'}\n`);
    }
    if (process.argv.includes('--check') && report.disagreements.length) {
        process.stderr.write(`\nLedger disagrees with measured coverage for: ${report.disagreements.join(', ')}\n`);
        process.exitCode = 1;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
