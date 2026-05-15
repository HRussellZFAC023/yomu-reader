import { afterEach, describe, expect, it } from 'vitest';

import { nestedParseAlreadyScheduled, nestedTextParsePlan } from '../../src/reader/nested-text-parse';

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
});
