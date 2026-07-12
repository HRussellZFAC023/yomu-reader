import fs from 'node:fs';
import path from 'node:path';
import { loadVerticalSliceContent } from '../../src/academy/content/vertical-slice';

describe('vertical-slice source fidelity', () => {
    it('binds the playable repair to the exact Moodle payload, page and printed item', async () => {
        const fetcher = vi.fn(async (value: string | URL | Request) => {
            const url = String(value);
            const name = url.split('/').at(-1) ?? '';
            return new Response(fs.readFileSync(path.resolve('public/academy/content/vertical-slice', name)), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }) as unknown as typeof fetch;
        const content = await loadVerticalSliceContent(fetcher);
        const question = await content.sourceLibrary.getQuestion('source-question:classroom-phrase-09');
        const document = await content.sourceLibrary.getDocument(question.documentId);

        expect(document.sha256).toBe('1e58967eb11b2d98d9b48a2547f392db90805836d96c232f11ac487d25b687ba');
        expect(question.locus).toMatchObject({ page: 2, printedNumber: '9' });
        expect(question.prompt).toEqual({
            en: 'Once more/again (Please).',
            ja: '９）もう　いちど（おねがいします）。',
        });
        expect(content.augmentation.sourceQuestionId).toBe(question.id);
        expect(content.activity.sourceQuestionId).toBe(question.id);
        expect(content.activity.payload.options.find(option => option.correct)?.label.ja).toBe('もう いちど おねがいします。');
    });
});
