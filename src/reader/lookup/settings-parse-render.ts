import type { ReaderSettings } from '../app/types';

export function settingsForSettingsFormParse(form: HTMLFormElement, settings: ReaderSettings): ReaderSettings {
    const furiganaMode = form.querySelector<HTMLSelectElement>('select[name="furiganaMode"]')?.value;
    const showPitchAccent = form.querySelector<HTMLInputElement>('input[name="showPitchAccent"]')?.checked;
    if (furiganaMode !== 'all' && furiganaMode !== 'difficult-kanji' && furiganaMode !== 'known-status' && furiganaMode !== 'hover' && furiganaMode !== 'off') {
        return typeof showPitchAccent === 'boolean' ? { ...settings, showPitchAccent } : settings;
    }
    return {
        ...settings,
        showFurigana: furiganaMode !== 'off',
        furiganaMode,
        showPitchAccent: typeof showPitchAccent === 'boolean' ? showPitchAccent : settings.showPitchAccent,
    };
}

export function addSettingsRubyFromRenderedReadings(form: HTMLFormElement, settings: ReaderSettings): void {
    if (!settings.showFurigana || settings.furiganaMode === 'off') return;
    for (const word of form.querySelectorAll<HTMLElement>('.jpdb-reader-word')) {
        if (word.querySelector('rt,.jpdb-reader-furi')) continue;
        const reading = word.dataset.reading?.trim() ?? '';
        const surface = word.dataset.surface?.trim() || word.dataset.expression?.trim() || word.textContent?.trim() || '';
        if (!surface || !reading || reading === surface || !/[\u3400-\u9fff]/u.test(surface) || !/^[\u3040-\u30ffー・]+$/u.test(reading)) continue;
        const ruby = document.createElement('ruby');
        const base = document.createElement('span');
        base.className = 'jpdb-reader-ruby-base';
        base.textContent = surface;
        const open = document.createElement('rp');
        open.textContent = '(';
        const rt = document.createElement('rt');
        rt.className = 'jpdb-reader-furi';
        rt.textContent = reading;
        const close = document.createElement('rp');
        close.textContent = ')';
        ruby.append(base, open, rt, close);
        word.replaceChildren(ruby);
        word.classList.add('jpdb-reader-has-furi');
    }
}
