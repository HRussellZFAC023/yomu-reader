import { afterEach, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { localizeSettingsForm, renderDictionarySourceRows } from '../../src/reader/settings/form';

afterEach(() => { document.body.replaceChildren(); });

// A frequency dictionary has no row of its own, and no terms dictionary is
// imported yet, so Settings → Sources shows both of its help lines.
const SHELF = {
    ...DEFAULT_SETTINGS,
    dictionaryPreferences: [{ name: 'JPDB Frequency', alias: 'JPDB Frequency', enabled: true, priority: 0, type: 'frequency' as const }],
};
const JAPANESE_HELP = ['ローカル定義にはYomitan辞書を使います。', 'メタデータ辞書は、バッジや漢字データとして表示されます。'];
const ENGLISH_HELP = ['Import Yomitan for local definitions.', 'Metadata dictionaries appear as badges or kanji data.'];

function renderSources(interfaceLanguage: 'en' | 'ja'): HTMLFormElement {
    document.body.innerHTML = `<form>${renderDictionarySourceRows({ ...SHELF, interfaceLanguage })}</form>`;
    return document.querySelector('form')!;
}

function sourcesHelp(form: HTMLFormElement): string[] {
    return [...form.querySelectorAll('.jpdb-reader-help')].map(help => help.textContent ?? '');
}

// The shelf re-renders these rows after an import or removal without
// relabelling the form, so they must already be in the learner's language.
it('writes the Sources help lines in Japanese when the rows are rendered', () => {
    const help = sourcesHelp(renderSources('ja'));
    expect(help).toEqual(expect.arrayContaining(JAPANESE_HELP));
    expect(help.join('\n')).not.toMatch(/Metadata dictionaries|Import Yomitan/u);
});

it('relabels the Sources help lines when the interface language changes', () => {
    const form = renderSources('en');
    expect(sourcesHelp(form)).toEqual(expect.arrayContaining(ENGLISH_HELP));
    localizeSettingsForm(form, 'ja');
    expect(sourcesHelp(form)).toEqual(expect.arrayContaining(JAPANESE_HELP));
    localizeSettingsForm(form, 'en');
    expect(sourcesHelp(form)).toEqual(expect.arrayContaining(ENGLISH_HELP));
});
