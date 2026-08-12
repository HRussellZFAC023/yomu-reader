import { describe, expect, it, vi } from 'vitest';
import { htmlToFirstElement, setInnerHtml } from '../../src/reader/dom/html';
import {
    bindPrivateCommandCapability,
    privateCommandAttributes,
    readCardCommandCapability,
    readDeckChoiceCapability,
    readPrivateCommandCapability,
} from '../../src/reader/dom/private-command-capabilities';
import { card, testCardActionController } from './jpdb/fixtures';
import {
    renderNewTabGradeControlButtons,
    selectedNewTabMainGradeTarget,
    summarizeNewTabReviewSources,
} from '../../src/reader/newtab/review-controls';

describe('private command capabilities', () => {
    it('hydrates an HTML-string command before a hostile mutation observer can rewrite it', async () => {
        const root = document.createElement('div');
        document.body.append(root);
        const observed = vi.fn();
        const observer = new MutationObserver(() => {
            const button = root.querySelector<HTMLButtonElement>('button');
            if (!button) return;
            button.dataset.action = 'anki-edit';
            button.dataset.grade = 'easy';
            button.dataset.noteId = '999';
            observed();
        });
        observer.observe(root, { attributes: true, childList: true, subtree: true });

        setInnerHtml(root, `<button data-action="grade" data-grade="hard" data-note-id="41"${privateCommandAttributes({
            kind: 'card-action',
            action: 'grade',
            grade: 'hard',
        })}>Grade</button>`);

        await Promise.resolve();
        const button = root.querySelector('button');
        expect(observed).toHaveBeenCalled();
        expect(button?.getAttribute('data-yomu-private-token')).toBeNull();
        expect(button?.getAttribute('data-action')).toBe('anki-edit');
        expect(readCardCommandCapability(button)).toEqual({
            kind: 'card-action',
            action: 'grade',
            grade: 'hard',
        });
        observer.disconnect();
    });

    it('executes the originally bound Anki note command after hostile DOM rewrites', async () => {
        const browseNote = vi.fn(async () => undefined);
        const controller = testCardActionController({ anki: { browseNote } as never });
        const root = document.createElement('div');
        document.body.append(root);
        const observer = new MutationObserver(() => {
            const button = root.querySelector<HTMLButtonElement>('button');
            if (!button) return;
            button.dataset.action = 'grade';
            button.dataset.grade = 'easy';
            button.dataset.noteId = '999';
        });
        observer.observe(root, { childList: true, subtree: true });

        setInnerHtml(root, `<button data-action="anki-edit" data-note-id="41"${privateCommandAttributes({
            kind: 'card-action',
            action: 'anki-edit',
            noteId: 41,
        })}>Edit</button>`);
        await Promise.resolve();
        const button = root.querySelector<HTMLButtonElement>('button')!;

        await controller.perform(readCardCommandCapability(button), button, card);

        expect(browseNote).toHaveBeenCalledOnce();
        expect(browseNote).toHaveBeenCalledWith(41);
        observer.disconnect();
    });

    it('does not grant authority to a cloned control or a copied consumed token', () => {
        const root = document.createElement('div');
        const attributes = privateCommandAttributes({ kind: 'card-action', action: 'anki-edit', noteId: 41 });
        const token = /data-yomu-private-token="([^"]+)"/.exec(attributes)?.[1];
        setInnerHtml(root, `<button${attributes}>Edit</button>`);
        const button = root.querySelector('button')!;
        const clone = button.cloneNode(true) as HTMLButtonElement;
        const replay = document.createElement('button');
        replay.setAttribute('data-yomu-private-token', token ?? '');

        expect(readCardCommandCapability(button)?.noteId).toBe(41);
        expect(readPrivateCommandCapability(clone)).toBeUndefined();
        expect(readPrivateCommandCapability(replay)).toBeUndefined();
    });

    it('preserves nested command authority through htmlToFirstElement without authorizing a later clone', () => {
        const section = htmlToFirstElement(`<section><button${privateCommandAttributes({
            kind: 'card-action',
            action: 'anki-edit',
            noteId: 41,
        })}>Edit</button></section>`)!;
        const button = section.querySelector<HTMLButtonElement>('button')!;
        const clone = section.cloneNode(true) as HTMLElement;

        expect(button.hasAttribute('data-yomu-private-token')).toBe(false);
        expect(readCardCommandCapability(button)).toEqual({
            kind: 'card-action',
            action: 'anki-edit',
            noteId: 41,
        });
        expect(readPrivateCommandCapability(clone.querySelector('button'))).toBeUndefined();
    });

    it('snapshots direct bindings and array arguments', () => {
        const button = document.createElement('button');
        const audioUrls = ['https://audio.example/one.mp3'];
        bindPrivateCommandCapability(button, {
            kind: 'card-action',
            action: 'jiten-audio',
            audioUrls,
        });
        audioUrls[0] = 'https://attacker.example/redirect.mp3';

        const command = readCardCommandCapability(button);
        expect(command?.audioUrls).toEqual(['https://audio.example/one.mp3']);
        expect(Object.isFrozen(command)).toBe(true);
        expect(Object.isFrozen(command?.audioUrls)).toBe(true);
    });

    it('keeps select option identity in the option WeakMap when values and attributes change', () => {
        const select = document.createElement('select');
        setInnerHtml(select, `<option value="jpdb:real" data-deck-source="jpdb" data-deck-id="real"${privateCommandAttributes({
            kind: 'deck-choice',
            source: 'jpdb',
            id: 'real',
        })}>Real deck</option>`);
        const option = select.options[0]!;
        option.value = 'anki:attacker';
        option.dataset.deckSource = 'anki';
        option.dataset.deckId = 'attacker';

        expect(readDeckChoiceCapability(option)).toEqual({
            kind: 'deck-choice',
            source: 'jpdb',
            id: 'real',
        });
    });

    it('keeps New Tab grade and selected target authority after hostile option rewrites', () => {
        const root = document.createElement('div');
        root.append(...renderNewTabGradeControlButtons({
            apiShortLabel: 'JPDB',
            bothLabel: 'Both',
            grades: [['hard', 'Hard']],
            selectorLabel: 'Target',
            selectedOption: { id: 'jpdb', kind: 'jpdb', label: 'Grades JPDB', shortLabel: 'JPDB' },
            summary: summarizeNewTabReviewSources(['jpdb-api', 'anki']),
            targetLabel: 'Grades JPDB',
            targetOptions: [
                { id: 'jpdb', kind: 'jpdb', label: 'Grades JPDB', shortLabel: 'JPDB' },
                { id: 'anki:404', kind: 'anki', label: 'Grades Anki', shortLabel: 'Anki', ankiCardId: 404 },
            ],
        }));
        const grade = root.querySelector<HTMLButtonElement>('[data-grade]')!;
        const selected = root.querySelector<HTMLSelectElement>('select')!.selectedOptions[0]!;
        grade.dataset.grade = 'easy';
        selected.value = 'anki:999';
        selected.dataset.newtabReviewTarget = 'anki';
        selected.dataset.ankiCardId = '999';

        expect(readCardCommandCapability(grade)?.grade).toBe('hard');
        expect(selectedNewTabMainGradeTarget(root)).toEqual({ kind: 'jpdb' });
    });
});
