import { BatchReceiptLedger } from '../../src/reader/cards/batch-receipt-ledger';

describe('batch receipt retirement', () => {
    it('retires an original combined operation satisfied by an Anki-only retry', () => {
        const ledger = new BatchReceiptLedger(2);
        const combined = ledger.reserve([{ id: 'combined', keys: ['api', 'anki'], required: ['api', 'anki'] }])!;
        ledger.set('api', 'completed');
        ledger.finish(combined);
        const retry = ledger.reserve([{ id: 'anki-only', keys: ['anki'], required: ['anki'] }])!;
        ledger.set('anki', 'completed');
        ledger.finish(retry);
        ledger.beginGeneration();
        expect(ledger.size).toBe(0);
        expect(ledger.get('anki')).toBeUndefined();
        expect(ledger.reserve([{ id: 'other', keys: ['other'], required: ['other'] }])).not.toBeNull();
    });

    it.each(['missing', 'uncertain'] as const)('retains the completed prefix while the other stage is %s', state => {
        const ledger = new BatchReceiptLedger(2);
        const operation = ledger.reserve([{ id: 'combined', keys: ['api', 'anki'], required: ['api', 'anki'] }])!;
        ledger.set('api', 'completed');
        if (state === 'uncertain') ledger.set('anki', 'uncertain');
        ledger.finish(operation);
        ledger.beginGeneration();
        expect(ledger.get('api')).toBe('completed');
        expect(ledger.size).toBe(2);
        expect(ledger.reserve([{ id: 'other', keys: ['other'], required: ['other'] }])).toBeNull();
    });
});
