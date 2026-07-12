import { createSourceLibrary, type SourceLibraryData } from '../../src/academy/domain/source-library';

const HASH = 'a'.repeat(64);
const MEDIA_HASH = 'b'.repeat(64);

function sourceData(): SourceLibraryData {
    return {
        documents: [{
            id: 'doc:welcome',
            sha256: HASH,
            mediaType: 'application/pdf',
            originalName: 'welcome.pdf',
            extractionRevision: 'extract:v1',
        }],
        occurrences: [{
            id: 'occurrence:week-01',
            documentId: 'doc:welcome',
            courseId: 'course:ucl',
            sectionId: 'section:foundation',
            weekId: 'week:01',
            sourcePath: 'Week 01/welcome.pdf',
        }],
        media: [{
            id: 'media:welcome-map',
            documentId: 'doc:welcome',
            locus: { page: 2, bbox: { x: 10, y: 20, width: 100, height: 80 } },
            role: 'map',
            mediaType: 'image/png',
            sha256: MEDIA_HASH,
            exactSource: true,
            alt: { en: 'A route map.', ja: '道順の地図。' },
        }],
        questions: [{
            id: 'question:welcome-1',
            documentId: 'doc:welcome',
            occurrenceIds: ['occurrence:week-01'],
            locus: { page: 2, printedNumber: '1' },
            instructions: { en: 'Choose the route.', ja: '道順を選んでください。' },
            prompt: { en: 'Where should Aakash turn?', ja: 'アーカーシュさんはどこで曲がりますか。' },
            responseKind: 'choice',
            mediaIds: ['media:welcome-map'],
            extractionRevision: 'extract:v1',
        }],
    };
}

describe('source library', () => {
    it('preserves document, occurrence, question and media identity without exposing mutable internals', async () => {
        const library = createSourceLibrary(sourceData());
        const questions = [];
        for await (const question of library.questionsForOccurrence('occurrence:week-01')) questions.push(question);

        expect(questions.map(question => question.id)).toEqual(['question:welcome-1']);
        expect((await library.mediaForQuestion('question:welcome-1'))[0]).toMatchObject({
            id: 'media:welcome-map',
            exactSource: true,
        });
        const returned = await library.getDocument('doc:welcome');
        (returned as { originalName: string }).originalName = 'changed.pdf';
        expect((await library.getDocument('doc:welcome')).originalName).toBe('welcome.pdf');
    });

    it('rejects cross-document media and missing occurrences at construction time', () => {
        const crossDocument = sourceData();
        const badData: SourceLibraryData = {
            ...crossDocument,
            documents: [...crossDocument.documents, {
                id: 'doc:other',
                sha256: 'c'.repeat(64),
                mediaType: 'application/pdf',
                originalName: 'other.pdf',
                extractionRevision: 'extract:v1',
            }],
            media: [{ ...crossDocument.media[0], documentId: 'doc:other' }],
        };
        expect(() => createSourceLibrary(badData)).toThrow('from another document');

        const missingOccurrence: SourceLibraryData = {
            ...sourceData(),
            occurrences: [],
        };
        expect(() => createSourceLibrary(missingOccurrence)).toThrow('Unknown occurrence');
    });
});
