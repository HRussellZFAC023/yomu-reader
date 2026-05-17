import { afterEach, describe, expect, it } from 'vitest';

import { clearNestedParseState, nestedParseAlreadyScheduled, nestedTextParsePlan } from '../../src/reader/nested-text-parse';

describe('nested text parse plans', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('collects parseable text targets and recognizes scheduled parse keys', () => {
        document.body.innerHTML = '<section><p class="jpdb-reader-parseable">今日はいい天気です。</p></section>';
        const root = document.body.querySelector<HTMLElement>('section');

        const plan = root ? nestedTextParsePlan(root, 24) : null;

        expect(plan?.targets.map(target => target.text)).toEqual(['今日はいい天気です。']);
        expect(plan?.parseKey).toBe('今日はいい天気です。');
        expect(root && plan ? nestedParseAlreadyScheduled(root, plan.parseKey) : true).toBe(false);
        if (root && plan) root.dataset.jpdbReaderParseLoadingKey = plan.parseKey;
        expect(root && plan ? nestedParseAlreadyScheduled(root, plan.parseKey) : false).toBe(true);
    });

    it('collects Japanese fragments from parseable grammar examples', () => {
        document.body.innerHTML = '<section><div class="jpdb-reader-grammar-example jpdb-reader-parseable"><div>窓が開けてあります。</div><div>The window has been opened and left that way.</div></div></section>';
        const root = document.body.querySelector<HTMLElement>('section');

        const plan = root ? nestedTextParsePlan(root, 24) : null;

        expect(plan?.targets.map(target => target.text)).toEqual(['窓が開けてあります。']);
    });

    it('clears stale parse markers before replacing parseable content', () => {
        document.body.innerHTML = '<section data-jpdb-reader-parse-key="今日はいい天気です。" data-jpdb-reader-parse-loading-key="今日はいい天気です。"><p class="jpdb-reader-parseable">今日はいい天気です。</p></section>';
        const root = document.body.querySelector<HTMLElement>('section')!;
        const plan = nestedTextParsePlan(root, 24)!;

        clearNestedParseState(root);

        expect(nestedParseAlreadyScheduled(root, plan.parseKey)).toBe(false);
        expect(root.dataset.jpdbReaderParseKey).toBeUndefined();
        expect(root.dataset.jpdbReaderParseLoadingKey).toBeUndefined();
    });
});
