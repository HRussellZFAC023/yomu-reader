#!/usr/bin/env node
// Generates docs/reference/settings.md: every key in DEFAULT_SETTINGS, grouped by
// the section of the settings dialog that owns it.
//
// Why generated. Yomu stores a few hundred settings. A hand-written reference goes
// stale on the first rename, and a stale reference is worse than none, because it
// sends a learner looking for a control that no longer exists. So this reads the
// real source, and `--check` fails the build when the page and the source disagree.
//
// How each row is derived, all of it from the reader's own code:
//   * Section and tab come from the fieldset that renders the control, so the page
//     is ordered the way the dialog is ordered.
//   * The label is the label the form renders, which the form builds from `uiText`.
//     So the wording here is the wording on screen, already translated.
//   * Which control writes which stored key is measured, not guessed: the form is
//     rendered, `readFormSettings` reads it once for a baseline, then each control
//     is nudged and read again. Keys whose value moved are the keys that control
//     writes. That is how combined controls are resolved, such as the one field
//     that stores `annotationsPaused`, and it keeps working through a rename.
//   * Dictionary and kanji source rows take their name and description from
//     `src/reader/sources/sections.ts`.
//   * A setting with no control anywhere falls back to an i18n entry keyed by its
//     own name.
// FRESH_INSTALL_PRESENTATION below owns the small set of deliberate reference-level
// overrides where historical stored values are not the behavior a fresh learner
// experiences. Outside that policy, nothing is invented. A setting with no wording
// in any of those places is marked "Not yet described" and stays in the table: an
// admitted gap costs a learner less than a confident guess.
//
//   node scripts/settings-reference.mjs           # write the page
//   node scripts/settings-reference.mjs --check   # fail if the page is stale
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const SETTINGS_REFERENCE_PAGE = path.join(ROOT, 'docs', 'reference', 'settings.md');

const NOT_DESCRIBED = 'Not yet described';
const NO_DESCRIPTION = '—';
const IGNORED_COMPATIBILITY_SETTINGS = new Set([
    'uchisenEnabled',
    'uchisenAlias',
    'uchisenPriority',
]);
const LEARNING_TARGET_CHOSEN_LABEL = 'Learning target selected';
const LEARNING_TARGET_CHOSEN_DESCRIPTION = 'Records whether you chose a learning target. Until you do, target-specific reading, dictionary, OCR, and Study work stays off.';
const UCHISEN_RETIREMENT_COPY = 'Uchisen is not an embedded kanji source. It remains available only as a disabled-by-default outbound lookup link; よむ does not fetch or render its pages, mnemonic stories, images, keywords, or components. Older saved `uchisenEnabled`, `uchisenAlias`, and `uchisenPriority` fields are retained for settings compatibility but ignored.';
const FRESH_INSTALL_PRESENTATION = new Map([
    ['annotationsPaused', {
        label: 'Selected learning-language text on webpages',
        value: 'inactive until a learning target is explicitly chosen',
    }],
    ['youtubeImmersionEnabled', {
        label: 'Filter YouTube to the selected learning language',
        value: 'stored on; inactive before target choice, then automatic for Japanese or opt-in for any other target',
    }],
    ['youtubeShowChannelRecommendations', {
        value: 'stored on; inactive until Japanese is explicitly chosen',
    }],
    ['preferJapaneseSiteLanguage', {
        value: 'off; explicit opt-in after choosing Japanese',
    }],
]);
const REFERENCE_SECTION_HELP = new Map([
    ['YouTube', 'Filter YouTube for the selected learning language. Japanese channel suggestions and Japanese-site navigation are available only after Japanese is explicitly chosen.'],
]);
// The page's own words, in one place. Each of these, plus the four column labels
// and the marker above, has a Japanese entry keyed by the exact English string in
// docs/.vitepress/locales/docs-prose-catalog.ts. Change one and add the matching entry.
const PAGE_COPY = Object.freeze({
    description: 'Every Yomu setting, its default, and the part of the settings dialog that holds it.',
    intro: 'Every setting Yomu stores is listed here, in the order the settings dialog presents them.',
    open: 'Open the dialog from the Yomu button on any page.',
    freshSetup: 'Fresh setup is language-neutral. Target-specific reading and Japanese-only preferences stay inactive until you explicitly choose a learning target. Some compatibility fields retain historical stored values; when one could look like a fresh Japanese default, the table states the effective gated behavior instead.',
    columns: 'Each row gives the label the dialog shows, the explanation the dialog offers, the stored default or effective fresh-install gate, and the name the setting takes in an exported settings file.',
    generated: 'This page is generated from the reader source, so it stays in step with the version you have installed.',
    gaps: `Some rows say ${NOT_DESCRIBED}. That marks a real stored setting whose wording is still to be written, shown as a gap rather than filled with a guess.`,
    unplacedTitle: 'Settings without a section of their own',
    unplaced: 'Yomu stores these the same way, and a settings export carries them. Some are written as you use the app, such as where you dragged the settings puck. Others are set by a control that covers several settings at once, so this page leaves the section blank rather than picking one.',
});
// One source row edits three stored keys. The row carries the learner-visible
// source name; these name the part of the row.
const SOURCE_ROW_ROLES = new Map([
    ['Enabled', 'shown in the popup'],
    ['Alias', 'display name'],
    ['Priority', 'order in the popup'],
]);

export async function settingsReference() {
    const source = await loadSettingsSource();
    const form = source.window.document.createElement('form');
    form.innerHTML = source.formHtml;
    source.window.document.body.append(form);

    const sections = formSections(form);
    const controls = controlIndex(sections);
    const writers = measureControlWriters(form, controls, source);
    const rows = settingRows(source, controls, writers);
    return { markdown: renderPage(sections, rows), rows };
}

// One entry per fieldset, in the order the dialog renders them, tagged with the
// tab that reveals it.
function formSections(form) {
    const tabLabels = new Map([...form.querySelectorAll('button[data-action="settings-panel"][data-panel]')]
        .map(button => [button.dataset.panel, collapse(button.textContent)]));
    return [...form.querySelectorAll('fieldset[data-settings-panel]')].map(fieldset => {
        const title = collapse(directLegend(fieldset)?.textContent ?? '');
        return {
            tab: tabLabels.get(fieldset.dataset.settingsPanel) ?? fieldset.dataset.settingsPanel,
            title,
            help: referenceSectionHelp(title, fieldset),
            fieldset,
        };
    });
}

function referenceSectionHelp(title, fieldset) {
    return REFERENCE_SECTION_HELP.get(title) ?? sectionHelp(fieldset);
}

function directLegend(fieldset) {
    return [...fieldset.children].find(child => child.tagName === 'LEGEND') ?? null;
}

// The fieldset's own description, the one a screen reader announces with the
// section. Links inside it are actions, not description, so they come out.
function sectionHelp(fieldset) {
    const id = fieldset.getAttribute('aria-describedby');
    const help = id ? fieldset.ownerDocument.getElementById(id) : null;
    if (!help) return '';
    const clone = help.cloneNode(true);
    clone.querySelectorAll('a').forEach(anchor => anchor.remove());
    return collapse(clone.textContent);
}

// control name -> { label, section, elements }. A name can render in two
// sections (a shortcut field appears on Reader and on Shortcuts); the first one
// wins, which is the one a learner meets first.
function controlIndex(sections) {
    const index = new Map();
    for (const section of sections) {
        for (const control of section.fieldset.querySelectorAll('input[name], select[name], textarea[name]')) {
            if (!control.name) continue;
            const existing = index.get(control.name);
            if (existing) existing.elements.push(control);
            else index.set(control.name, { label: controlLabel(control), section, elements: [control] });
        }
    }
    return index;
}

function controlLabel(control) {
    if (control.type === 'radio') {
        const group = control.closest('fieldset.jpdb-reader-radio-group');
        return group ? collapse(directLegend(group)?.textContent ?? '') : '';
    }
    const label = control.closest('label');
    if (!label) return groupTitle(control);
    // Some labels wrap their text in the span the localize pass rewrites; the rest
    // keep it as a bare text node. Either way take only the label's own words:
    // option text lives inside the select, and a trailing "Get a key" link is an
    // action rather than a name.
    const wrapped = label.querySelector(':scope > .jpdb-reader-settings-label-text');
    if (wrapped) return withoutLinks(wrapped);
    return collapse([...label.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' '));
}

function withoutLinks(element) {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('a').forEach(anchor => anchor.remove());
    return collapse(clone.textContent);
}

// The theme switch is a control with a title instead of a label, so its own title
// is the name a learner sees. Deliberately narrow: a subsection heading or a
// section legend would also sit above an unlabelled control, and lending one of
// those to a hidden field puts a name on a setting that never had one.
function groupTitle(control) {
    let scope = control.parentElement;
    for (let depth = 0; scope && depth < 2; depth += 1, scope = scope.parentElement) {
        const title = scope.querySelector(':scope > .jpdb-reader-theme-title');
        if (title) return collapse(title.textContent);
    }
    return '';
}

// Nudge one control at a time and see which stored keys move. `readFormSettings`
// is the reader's own form-to-settings pass, so this measures the real wiring
// instead of restating it here.
function measureControlWriters(form, controls, source) {
    const baseline = flatten(source.readFormSettings(new source.window.FormData(form), source.defaults));
    const writers = new Map();
    for (const [name, control] of controls) {
        const data = nudged(form, name, control.elements, source.window);
        if (!data) continue;
        const changed = flatten(source.readFormSettings(data, source.defaults));
        for (const key of Object.keys(baseline)) {
            if (baseline[key] === changed[key]) continue;
            const existing = writers.get(key);
            if (existing) existing.push(name);
            else writers.set(key, [name]);
        }
    }
    return writers;
}

function nudged(form, name, elements, window) {
    const data = new window.FormData(form);
    const first = elements[0];
    if (first.type === 'checkbox') {
        const checked = elements.some(element => element.checked);
        data.delete(name);
        if (!checked) for (const element of elements) data.append(name, element.value || 'on');
        return data;
    }
    const alternative = first.type === 'radio'
        ? elements.find(element => !element.checked)?.value
        : first.tagName === 'SELECT'
            ? [...first.options].find(option => option.value !== first.value)?.value
            : otherText(first, data.get(name) ?? '');
    if (alternative === undefined) return null;
    data.set(name, alternative);
    return data;
}

function otherText(control, current) {
    if (control.type === 'number' || control.type === 'range') return String((Number(current) || 0) + 1);
    if (control.type === 'color') return current === '#123456' ? '#654321' : '#123456';
    return `${current}zz`;
}

function flatten(settings) {
    return Object.fromEntries(Object.entries(settings).flatMap(([key, value]) => (
        key === 'shortcuts'
            ? Object.entries(value).map(([name, shortcut]) => [`shortcuts.${name}`, JSON.stringify(shortcut)])
            : [[key, JSON.stringify(value)]]
    )));
}

function settingRows(source, controls, writers) {
    const values = flatten(source.defaults);
    return Object.keys(values).filter(key => !IGNORED_COMPATIBILITY_SETTINGS.has(key)).map(key => {
        const wording = settingWording(key, controls, writers, source);
        return Object.assign({
            key,
            label: wording.label || NOT_DESCRIBED,
            described: Boolean(wording.label),
            description: wording.description || NO_DESCRIPTION,
            section: wording.section,
            value: formatValue(JSON.parse(values[key] ?? 'null'), wording.control),
        }, FRESH_INSTALL_PRESENTATION.get(key));
    });
}

const SETTING_WORDING_POLICIES = Object.freeze([
    learningTargetSettingWording,
    directlyControlledSettingWording,
    sourceSettingWording,
    solelyWrittenSettingWording,
]);
const NO_CONTROL_WRITERS = Object.freeze([]);

function settingWording(key, controls, writers, source) {
    const context = { key, controls, writers, source };
    for (const policy of SETTING_WORDING_POLICIES) {
        const wording = policy(context);
        if (wording) return wording;
    }
    return sharedSettingWording(context);
}

function learningTargetSettingWording({ key }) {
    return key === 'learningTargetChosen' ? {
        label: LEARNING_TARGET_CHOSEN_LABEL,
        description: LEARNING_TARGET_CHOSEN_DESCRIPTION,
        section: null,
        control: null,
    } : null;
}

function directlyControlledSettingWording({ key, controls }) {
    return controlSettingWording(controls.get(key));
}

function sourceSettingWording({ key, controls, source }) {
    return sourceRowWording(key, controls, source.sourceRows);
}

function solelyWrittenSettingWording({ key, controls, writers }) {
    // One control, and that control writes nothing else: its label names this key
    // and only this key. Anything less exact would put another setting's label on
    // this row. The Jiten and JPDB credential fields both reach `apiKey`, for
    // instance, so neither may claim it.
    return controlSettingWording(controls.get(soleWriterName(key, writers)));
}

function sharedSettingWording({ key, controls, writers, source }) {
    // Otherwise the key is one of several a control writes, or it is a list edited
    // through repeated rows. Every candidate label there names a different setting,
    // so take this key's own i18n entry and, failing that, name no label at all.
    // The section is still known, which is most of what a reader came for.
    const written = writtenControlNames(key, writers);
    const shared = written.map(name => controls.get(name)).find(Boolean);
    return { label: settingUiCopy(key, source), section: controlSection(shared), description: '', control: null };
}

function controlSettingWording(control) {
    return control ? { label: control.label, section: control.section, description: '', control } : null;
}

function writtenControlNames(key, writers) {
    return writers.get(key) ?? NO_CONTROL_WRITERS;
}

function soleWriterName(key, writers) {
    const written = writtenControlNames(key, writers);
    if (written.length !== 1) return null;
    if (keysWrittenBy(written[0], writers) !== 1) return null;
    return written[0];
}

function settingUiCopy(key, source) {
    return source.uiCopy[key] ?? '';
}

function controlSection(control) {
    return control?.section ?? null;
}

function keysWrittenBy(name, writers) {
    return [...writers.values()].filter(names => names.includes(name)).length;
}

function sourceRowWording(key, controls, sourceRows) {
    for (const [suffix, role] of SOURCE_ROW_ROLES) {
        if (!key.endsWith(suffix)) continue;
        const prefix = key.slice(0, -suffix.length);
        const row = sourceRows.get(prefix);
        const control = controls.get(`${prefix}.${suffix.toLowerCase()}`);
        if (!row || !control) continue;
        return { label: `${row.name}: ${role}`, section: control.section, description: row.help, control: null };
    }
    return null;
}

function formatValue(value, control) {
    if (value === undefined || value === null) return 'unset';
    if (value === '') return 'empty';
    if (typeof value === 'boolean') return value ? 'on' : 'off';
    if (Array.isArray(value)) return value.length ? countText(value.length) : 'empty list';
    if (typeof value === 'object') {
        const size = Object.keys(value).length;
        return size ? countText(size) : 'empty';
    }
    const menu = optionLabel(value, control);
    if (menu && menu !== String(value)) return `${menu} (${code(value)})`;
    if (menu) return menu;
    // Inline code, so a stored URL stays a value instead of being linkified into a
    // link this page invites nobody to follow.
    return code(value);
}

function code(value) {
    return `\`${shorten(String(value))}\``;
}

// Font stacks run to 200 characters. The whole value is in the settings export;
// this column only has to identify it.
function shorten(value) {
    return value.length > 44 ? `${value.slice(0, 43)}…` : value;
}

function countText(count) {
    return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

// A stored value like `difficult-kanji` means nothing on its own. When the control
// is a menu, lead with the wording the menu shows and keep the stored value too,
// because that is what an exported settings file holds.
function optionLabel(value, control) {
    const select = control?.elements.find(element => element.tagName === 'SELECT');
    const option = select ? [...select.options].find(item => item.value === String(value)) : null;
    return option ? collapse(option.textContent) : null;
}

function renderPage(sections, rows) {
    const { grouped, unplaced } = groupRowsBySection(sections, rows);
    // One paragraph per line, and no counts in the prose. Every English string on a
    // docs page needs a Japanese entry keyed by that exact string, so a sentence
    // must not carry a number that moves the next time a setting is added.
    const lines = [
        '---',
        'title: Settings reference',
        `description: ${PAGE_COPY.description}`,
        'editLink: false',
        '---',
        '',
        '# Settings reference',
        '',
        PAGE_COPY.intro,
        '',
        PAGE_COPY.open,
        '',
        PAGE_COPY.freshSetup,
        '',
        PAGE_COPY.columns,
        '',
        PAGE_COPY.generated,
        '',
        PAGE_COPY.gaps,
        '',
    ];

    for (const [section, sectionRows] of grouped) lines.push(...renderSection(section, sectionRows));
    lines.push(...renderUnplacedRows(unplaced));

    return `${lines.join('\n').trimEnd()}\n`;
}

function groupRowsBySection(sections, rows) {
    const grouped = new Map(sections.map(section => [section, []]));
    const unplaced = [];
    for (const row of rows) {
        const sectionRows = row.section ? grouped.get(row.section) : undefined;
        if (sectionRows) sectionRows.push(row);
        else unplaced.push(row);
    }
    return { grouped, unplaced };
}

function renderSection(section, rows) {
    if (!rows.length) return [];
    const lines = [`## ${sectionHeading(section)}`, ''];
    if (section.help) lines.push(section.help, '');
    if (section.title === 'Kanji') lines.push(UCHISEN_RETIREMENT_COPY, '');
    return [...lines, ...table(rows)];
}

function renderUnplacedRows(rows) {
    if (!rows.length) return [];
    return [
        `## ${PAGE_COPY.unplacedTitle}`,
        '',
        PAGE_COPY.unplaced,
        '',
        ...table(rows),
    ];
}

// Section name, plus the tab that reveals it when the two differ. Plain text
// rather than a <Badge>: VitePress builds each heading's permalink label from the
// raw heading source, so component markup there is read out as the section name.
function sectionHeading(section) {
    return section.tab && section.tab !== section.title
        ? `${section.title} (${section.tab} tab)`
        : section.title;
}

function table(rows) {
    return [
        '| Setting | What it does | Default | Stored as |',
        '| --- | --- | --- | --- |',
        ...rows.map(row => `| ${cell(row.label)} | ${cell(row.description)} | ${cell(row.value)} | \`${row.key}\` |`),
        '',
    ];
}

// A pipe would split the column. A `{{` would be read as a Vue expression on the
// built page and cannot be escaped inside the inline code these cells use, so stop
// rather than emit a page that renders an error where a value should be.
function cell(text) {
    if (text.includes('{{')) throw new Error(`settings reference cell contains a Vue expression: ${text}`);
    return text.replaceAll('|', '\\|');
}

function collapse(text) {
    // Drop bidi isolate/override controls. The interface-locale options wrap each
    // part in FSI/PDI so "العربية — Arabic" cannot reorder inside an RTL <select>,
    // which is right in the UI and pure noise in a Markdown table: invisible
    // characters that alter the generated file and survive a copy-paste out of it.
    return text.replace(/[⁦-⁩‪-‮]/g, '').replace(/\s+/g, ' ').trim();
}

// Bundle the settings source and load it against a jsdom window. The dialog is
// the only place that knows which control sits in which section, so it is asked
// rather than copied.
async function loadSettingsSource() {
    const workDir = mkdtempSync(path.join(tmpdir(), 'yomu-settings-reference-'));
    try {
        const entry = path.join(workDir, 'entry.ts');
        const bundle = path.join(workDir, 'bundle.mjs');
        writeFileSync(entry, entrySource());
        await esbuild.build({
            entryPoints: [entry],
            bundle: true,
            format: 'esm',
            platform: 'browser',
            target: 'es2022',
            outfile: bundle,
            logLevel: 'silent',
        });
        const window = installBrowserGlobals();
        await import(bundle);
        return { window, ...globalThis.__yomuSettingsReference() };
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

function entrySource() {
    const source = file => JSON.stringify(path.join(ROOT, file));
    return `
        import { DEFAULT_SETTINGS } from ${source('src/reader/settings/index.ts')};
        import { renderSettingsForm } from ${source('src/reader/settings/form.ts')};
        import { readFormSettings } from ${source('src/reader/settings/form-read.ts')};
        import { definitionSourceRows, kanjiSourceRows } from ${source('src/reader/sources/sections.ts')};
        import { uiText } from ${source('src/reader/app/i18n.ts')};

        (globalThis as any).__yomuSettingsReference = () => ({
            defaults: DEFAULT_SETTINGS,
            readFormSettings,
            formHtml: renderSettingsForm(DEFAULT_SETTINGS, 'https://jpdb.io/settings'),
            uiCopy: Object.fromEntries(Object.keys(DEFAULT_SETTINGS)
                .map(key => [key, uiText('en', key as never)])
                .filter(([, text]) => typeof text === 'string')),
            sourceRows: new Map([...definitionSourceRows(DEFAULT_SETTINGS), ...kanjiSourceRows(DEFAULT_SETTINGS)]
                .map(row => [row.prefix, { name: row.name, help: row.help }])),
        });
    `;
}

function installBrowserGlobals() {
    const { window } = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://yomureader.com/' });
    window.matchMedia = () => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
        dispatchEvent: () => false,
    });
    globalThis.window = window;
    globalThis.self = window;
    for (const name of Object.getOwnPropertyNames(window)) {
        if (name in globalThis) continue;
        try {
            globalThis[name] = window[name];
        } catch {
            // A few jsdom window properties refuse a plain copy. None of them are
            // reached while rendering or reading the settings form.
        }
    }
    return window;
}

async function main() {
    const { markdown, rows } = await settingsReference();
    const described = rows.filter(row => row.described).length;
    const check = process.argv.includes('--check');
    const stale = readCurrentPage() !== markdown;

    // --report gives the drift test the same numbers without loading this module
    // into a test realm: the generator builds its own window, and a test
    // environment that already owns `document` would collide with it.
    if (process.argv.includes('--report')) {
        process.stdout.write(`${JSON.stringify({
            stale,
            settings: rows.length,
            described,
            placed: rows.filter(row => row.section).length,
            sections: new Set(rows.filter(row => row.section).map(row => row.section.title)).size,
            keys: rows.map(row => row.key),
        })}\n`);
    }
    if (check) {
        if (!stale) {
            if (!process.argv.includes('--report')) {
                process.stdout.write(`settings reference is current: ${rows.length} settings, ${described} described\n`);
            }
            return;
        }
        process.stderr.write('docs/reference/settings.md no longer matches the settings source.\n');
        process.stderr.write('Regenerate it with: npm run docs:settings-reference\n');
        process.exitCode = 1;
        return;
    }
    mkdirSync(path.dirname(SETTINGS_REFERENCE_PAGE), { recursive: true });
    writeFileSync(SETTINGS_REFERENCE_PAGE, markdown);
    process.stdout.write(`wrote docs/reference/settings.md: ${rows.length} settings, ${described} described\n`);
}

function readCurrentPage() {
    try {
        return readFileSync(SETTINGS_REFERENCE_PAGE, 'utf8');
    } catch {
        return null;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    await main();
}
