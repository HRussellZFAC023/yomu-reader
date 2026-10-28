import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PROOF_SOURCE = readFileSync('scripts/youtube-ruby-coverage-proof.mjs', 'utf8');

describe('YouTube ruby coverage proof privacy contract', () => {
    it('audits opaque card identity while rejecting every public private-state projection', () => {
        expect(PROOF_SOURCE).toContain('renderedWordPrivateValue,');
        expect(PROOF_SOURCE).toContain("renderedWordPrivateValue(word, 'cardSource')");
        expect(PROOF_SOURCE).toContain("renderedWordPrivateValue(word, 'vid')");
        expect(PROOF_SOURCE).toContain("renderedWordPrivateValue(word, 'sid')");
        expect(PROOF_SOURCE).not.toContain('word.dataset.cardSource');

        for (const attribute of [
            'data-vid',
            'data-sid',
            'data-card-source',
            'data-card-id',
            'data-reading-index',
            'data-card-state',
            'data-state-provenance',
            'data-deck-names',
            'data-yomu-private-token',
        ]) {
            expect(PROOF_SOURCE).toContain(`'${attribute}'`);
        }

        expect(PROOF_SOURCE).toContain("privateSource === 'jpdb'");
        expect(PROOF_SOURCE).toContain('privateCardId === privateVid');
        expect(PROOF_SOURCE).toContain('privateReadingIndex === privateSid');
        expect(PROOF_SOURCE).toContain('PUBLIC_RENDERED_WORD_PRIVATE_ATTRIBUTES.has(name)');
        expect(PROOF_SOURCE).toContain('privateJpdbWordCount: words.filter(word => word.privateJpdbIdentity).length');
        expect(PROOF_SOURCE).not.toContain('jpdbWordCount: words.filter(word => word.source');
        expect(PROOF_SOURCE).toContain('rendered word exposes private state in public DOM attributes');
    });
});
