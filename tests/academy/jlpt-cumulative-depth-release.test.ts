import fs from 'node:fs';
import path from 'node:path';

const LESSON_ROOT = path.resolve('public/academy/content/lessons');
const TASK_MANIFEST = path.resolve('public/academy/content/listening/listening-task-bindings.v1.json');
const LEDGER_PATH = path.resolve('docs/academy/recovery/JLPT-READINESS-LEDGER.json');
const BANDS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const;
const JLPT_DOMAINS = ['vocabulary', 'grammar', 'reading', 'listening'] as const;
const COURSE_SKILLS = ['writing', 'speaking'] as const;

type Band = typeof BANDS[number];
type EvidenceRow = {
    domain: string;
    status: string;
    sourceIds?: string[];
    assessmentIds: string[];
};
type LessonRecord = {
    id: string;
    identity?: { levelBand?: Band };
    curriculumReadiness?: {
        weekEvidence: {
            band: Band;
            jlptDomains: EvidenceRow[];
            additionalCourseSkills: EvidenceRow[];
        };
    };
};
type LedgerBand = {
    band: Band;
    currentFullyAssessedEvidenceCount: number;
    minimumCumulativeEvidenceCount: number;
    lowerComparisonEvidenceCount: number;
    fullyAssessedJlptDomains: string[];
    fullyAssessedAdditionalCourseSkills: string[];
    depthGatePass: boolean;
    readinessStatus: 'ready' | 'not-ready';
    blockers: string[];
};

function loadLessons(): LessonRecord[] {
    return fs.readdirSync(LESSON_ROOT)
        .filter(file => file.endsWith('.json'))
        .sort()
        .map(file => JSON.parse(fs.readFileSync(path.join(LESSON_ROOT, file), 'utf8')) as LessonRecord);
}

describe('cumulative JLPT course-depth release audit', () => {
    const lessons = loadLessons();
    const packageBands = new Map(lessons.map(lesson => [lesson.id, lesson.identity?.levelBand]));
    const tasks = JSON.parse(fs.readFileSync(TASK_MANIFEST, 'utf8')) as {
        entries: Array<{ packageId: string; sourceQuestionId: string; source: { corpus: string } }>;
    };
    const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')) as {
        schema: string;
        measurementPolicy: {
            unit: string;
            fullyAssessedStatus: string;
            jlptDomains: string[];
            additionalCourseSkills: string[];
            excludedFromReadiness: string[];
        };
        sourceFamilies: Array<{ id: string; verifiedPlayableTaskCount: number; status: string }>;
        bands: LedgerBand[];
    };
    const evidence = new Map<Band, Set<string>>(BANDS.map(band => [band, new Set()]));
    const domains = new Map<Band, Set<string>>(BANDS.map(band => [band, new Set()]));
    const courseSkills = new Map<Band, Set<string>>(BANDS.map(band => [band, new Set()]));

    for (const task of tasks.entries) {
        const band = packageBands.get(task.packageId);
        if (!band || !BANDS.includes(band)) throw new Error(`${task.packageId} has no JLPT band for ${task.sourceQuestionId}`);
        evidence.get(band)!.add(task.sourceQuestionId);
        domains.get(band)!.add('listening');
    }
    for (const lesson of lessons) {
        const readiness = lesson.curriculumReadiness?.weekEvidence;
        if (!readiness) continue;
        for (const row of readiness.jlptDomains.filter(row => row.status === 'assessed-source-grounded')) {
            expect(row.sourceIds?.length, `${lesson.id}/${row.domain} has no source identity`).toBeGreaterThan(0);
            row.assessmentIds.forEach(id => evidence.get(readiness.band)!.add(id));
            if (row.assessmentIds.length > 0) domains.get(readiness.band)!.add(row.domain);
        }
        for (const row of readiness.additionalCourseSkills.filter(row => row.status === 'assessed-source-grounded')) {
            row.assessmentIds.forEach(id => evidence.get(readiness.band)!.add(id));
            if (row.assessmentIds.length > 0) courseSkills.get(readiness.band)!.add(row.domain);
        }
    }

    it('derives the ledger only from exact assessed evidence and excludes padding', () => {
        expect(ledger.schema).toBe('yomu-academy.jlpt-readiness-ledger/v1');
        expect(ledger.measurementPolicy).toMatchObject({
            unit: 'unique-assessed-source-grounded-skill-evidence',
            fullyAssessedStatus: 'assessed-source-grounded',
            jlptDomains: [...JLPT_DOMAINS],
            additionalCourseSkills: [...COURSE_SKILLS],
        });
        expect(ledger.measurementPolicy.excludedFromReadiness).toEqual(expect.arrayContaining([
            'raw-exercise-count',
            'unassessed-source-rows',
            'partially-assessed-source-rows',
            'original-yomu-enrichment',
            'unbound-or-unavailable-media',
            'duplicate-evidence-across-bands',
        ]));

        const owner = new Map<string, Band>();
        for (const band of BANDS) {
            for (const id of evidence.get(band)!) {
                expect(owner.get(id), `${id} pads both ${owner.get(id)} and ${band}`).toBeUndefined();
                owner.set(id, band);
            }
        }
    });

    it('keeps Moodle, Minna, Soya, Genki, Japanese-folder, and Shin Kanzen claims exact', () => {
        const taskCounts = new Map<string, number>();
        tasks.entries.forEach(task => taskCounts.set(task.source.corpus, (taskCounts.get(task.source.corpus) ?? 0) + 1));
        const sources = new Map(ledger.sourceFamilies.map(source => [source.id, source]));

        for (const corpus of ['moodle', 'minna', 'soya']) {
            expect(sources.get(corpus)).toMatchObject({
                verifiedPlayableTaskCount: taskCounts.get(corpus),
                status: 'exact-task-bound',
            });
        }
        expect(sources.get('genki')).toMatchObject({ verifiedPlayableTaskCount: 0, status: 'partial-or-prerequisite-evidence-only' });
        expect(sources.get('japanese-folder')).toMatchObject({ verifiedPlayableTaskCount: 0, status: 'duplicate-byte-task-provenance' });
        expect(sources.get('shin-kanzen')).toMatchObject({ verifiedPlayableTaskCount: 0, status: 'no-source-admissible-task-binding' });
    });

    it('enforces recursive N4>N5, N3>N4+N5, N2>all lower, and N1>all lower floors', () => {
        expect(ledger.bands.map(row => row.band)).toEqual(BANDS);
        const effectiveFloor = new Map<Band, number>();

        for (const [index, band] of BANDS.entries()) {
            const row = ledger.bands[index];
            const actual = evidence.get(band)!.size;
            const lowerComparison = index === 0
                ? 0
                : BANDS.slice(0, index).reduce((total, lowerBand) => total + effectiveFloor.get(lowerBand)!, 0);
            const expectedMinimum = index === 0 ? JLPT_DOMAINS.length : lowerComparison + 1;

            expect(row.currentFullyAssessedEvidenceCount, band).toBe(actual);
            expect(row.lowerComparisonEvidenceCount, band).toBe(lowerComparison);
            expect(row.minimumCumulativeEvidenceCount, band).toBe(expectedMinimum);
            expect(row.depthGatePass, band).toBe(actual >= expectedMinimum);
            expect(row.fullyAssessedJlptDomains, band).toEqual([...domains.get(band)!].sort());
            expect(row.fullyAssessedAdditionalCourseSkills, band).toEqual([...courseSkills.get(band)!].sort());
            effectiveFloor.set(band, Math.max(actual, expectedMinimum));
        }

        expect(evidence.get('N4')!.size).toBeGreaterThan(evidence.get('N5')!.size);
        expect(ledger.bands.find(row => row.band === 'N3')!.minimumCumulativeEvidenceCount)
            .toBeGreaterThan(effectiveFloor.get('N4')! + effectiveFloor.get('N5')!);
        expect(ledger.bands.find(row => row.band === 'N2')!.minimumCumulativeEvidenceCount)
            .toBeGreaterThan(effectiveFloor.get('N3')! + effectiveFloor.get('N4')! + effectiveFloor.get('N5')!);
        expect(ledger.bands.find(row => row.band === 'N1')!.minimumCumulativeEvidenceCount)
            .toBeGreaterThan(effectiveFloor.get('N2')! + effectiveFloor.get('N3')! + effectiveFloor.get('N4')! + effectiveFloor.get('N5')!);
    });

    it('permits a readiness claim only with complete domains, modalities, depth, and lower-band readiness', () => {
        for (const [index, row] of ledger.bands.entries()) {
            const completeDomains = JLPT_DOMAINS.every(domain => row.fullyAssessedJlptDomains.includes(domain));
            const completeSkills = COURSE_SKILLS.every(skill => row.fullyAssessedAdditionalCourseSkills.includes(skill));
            const lowerBandsReady = ledger.bands.slice(0, index).every(lower => lower.readinessStatus === 'ready');
            const mayClaimReady = row.depthGatePass && completeDomains && completeSkills && lowerBandsReady;

            expect(row.readinessStatus === 'ready', row.band).toBe(mayClaimReady);
            if (!mayClaimReady) expect(row.blockers.length, `${row.band} hides its readiness deficit`).toBeGreaterThan(0);
        }
        expect(ledger.bands.every(row => row.readinessStatus === 'not-ready')).toBe(true);
    });
});
