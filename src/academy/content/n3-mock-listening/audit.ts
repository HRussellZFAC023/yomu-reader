import type {
    Cur007CandidateAuditRecord,
    Cur007N3BatchAudit,
    N3MockListeningMechanic,
    N3MockListeningPackageId,
} from './types';

const SOYA_SOURCE_SHA256 = '2c37b6f24b68c60f1abb234157e3428bad5da7690a3d51b11ee2c0b5cb8a6e71';
const OFFICIAL_QUESTION_SHA256 = 'ba622e5b3a1d0de40cc390c1abe3aba7928948a3242b88e3afe45b391e8b7444';
const OFFICIAL_SCRIPT_SHA256 = '46d69fb5969fd5e38dc394b23c626139908fc7d0b1eecd97ed9196438cbb8b97';
const OFFICIAL_ANSWER_SHA256 = 'd143b461b95ecc347fe674251aed30ce4eef1a79af4327c9ce0ee6af6f8861d5';
const OFFICIAL_AUDIO_SHA256 = 'c637ea91f6f6e51aa085214712642138d76f6d5590ee6518b8d4d635102be3c0';

const SOYA_LEARNER_CONCEPTS = Object.freeze([
    'listening:n3-action-state',
    'listening:n3-action-state',
    'listening:n3-action-priority',
    'listening:n3-action-priority',
    'listening:n3-action-state',
    'listening:n3-action-priority',
    'listening:n3-distractor-elimination',
    'listening:n3-key-point',
    'listening:n3-distractor-elimination',
    'listening:n3-key-point',
    'listening:n3-key-point',
    'listening:n3-key-point',
    'listening:n3-overview-intent',
    'listening:n3-overview-intent',
    'listening:n3-outline-shift',
    'speaking:n3-register',
    'speaking:n3-pragmatic-fit',
    'speaking:n3-pragmatic-fit',
    'speaking:n3-pragmatic-fit',
    'listening:n3-response-implication',
    'speaking:n3-turn-response',
    'speaking:n3-turn-response',
    'listening:n3-response-implication',
    'listening:n3-response-implication',
    'speaking:n3-turn-response',
    'speaking:n3-turn-response',
    'listening:n3-response-implication',
    'listening:n3-response-implication',
] as const);

const SOYA_MEDIA = Object.freeze([
    sourceItem('mock1_l_01', '2ec97746543153482cac7999b230c5e50976de74670a46a295660c272fc71cf3', '7c568a3af30b66f1d76085f6dfd309f06dbbf2e06c8564413d371d22904be006', 524732),
    sourceItem('mock1_l_02', '277678b5dc0abcfaea23f0a6f540b4194b2a6a4cca641a03a9cdd0015ef2c88c', 'd931f59f4aa440bc5b4df72af9b2e4bac88e643b2ba247aa85203a5b4f5b4b40', 485084),
    sourceItem('mock1_l_03', '5455c7ca04259328fcb510f1785b937988b00312acbd5099e49852f4faaafe88', 'aa56cf9590803c019549c1f3cfdca0be09d4b23202df7914fc215b138e4c9a86', 474428),
    sourceItem('mock1_l_04', '7308d92bc2260ecb88d002ccc0e80ebd4ded582b1b8cb7f955a835bf8478becc', '9c34dbb395a195e280778b55f544c4931604f12831d3e5072d1f4b7832eeb8bd', 400628),
    sourceItem('mock1_l_05', '3bb8051e58f4752fbea9d574341ad32d74595349f04846b1ca406d9012259981', '75d494710c9fe11243553ce71a8f30fa7395c456a0b014636ef89054c42e11f6', 425756),
    sourceItem('mock1_l_06', '70bd487df7ca43d339b87c0546b2f22995f449fa6e4b379d81cf56a000ee67c5', 'acbdf5d78eee6529cc97985694ac20473e311c734302dfd22a4137d9c47fb714', 515564),
    sourceItem('mock1_l_07', 'a1e5b22723ef38982e0e23943fa4e04564c54814ce5130b45856a4e2a638b38f', '24bb0f3cdf4ebf77505750b44d2e9c9be0ff46044e50a0d33cfee14d13fad906', 336884),
    sourceItem('mock1_l_08', '0c26ed48b052d624677c5af8917d971f7ee51df6c89bd49bbd2f6f832c739214', '6c41b541e200c13467b69ba2d83843fc37a1ed0db4c5d93537b2465749a165f3', 334028),
    sourceItem('mock1_l_09', 'b3097e3ca255f023a0eaeb4689e8c1279086ee13844f810d3155afa8fbbe5296', 'aca9a2eb2d78ddd94f906f335a3bb641103286821148248c54d318438dbaaf48', 393548),
    sourceItem('mock1_l_10', '8b5f2e122d5b7a395aa6dbb49bde45ef9a4d00b1c04e37dd28142739179673b1', '07a2a5a708f5a6ea42e435d8df261fbca7f00e7ffe3cab587a450b177583c4c3', 317324),
    sourceItem('mock1_l_11', '9ca9df144e157f8bc4a528effdadfedc082f6e7be07187a3d58d4ec5de00b5e2', '28c9543d0d68bc88f8c7af35b750de198e3dcbeb28d68d4f21e029d6e856407f', 410852),
    sourceItem('mock1_l_12', '0d32efe6a0903b077ced6b32c51806ac4527b1123fb5c6368b1584ed9821f0f6', 'd981e42c236a6eee46750edb157f4e08daba41c803a5395c92b0de803a1de0e2', 356876),
    sourceItem('mock1_l_13', '12370ad44f48add02b983205e86e25f02b10c9831c3d282f1a55ba5ddc550050', '0f1a4b18d8d5ee1b04043dd827d29daf213125a76bde9791bc40facf742cddad', 436364),
    sourceItem('mock1_l_14', 'dd372949b15b93458c7555d885f9eb455d96ac8ba7bf55116c772228a12e888f', 'd54c19df6f826bfd679c517c824685979063f34c8c6dd6e09914e42f4d637b5a', 409364),
    sourceItem('mock1_l_15', 'eb9478500d5141a977f54f437dacd3420da69f09b984c6aa08c089c540a28611', '1e0426aca0b881b25178590589295f56766e70b99791d690afa78d35f04a3fb3', 420116),
    sourceItem('mock1_l_16', '2f4819e54eadc539e506fad7339694898ca0173f54663fe918b413ddd32d66b1', 'b2911822cb1ef7cf686c30bb70bd18d7f73467b4fc54092fa621e1f90d105338', 162284),
    sourceItem('mock1_l_17', 'f813204e535b299c3b3bd25552d64a9f934726d31143ea9a0cf79a642b0a18f9', '636bcff8a407c00ef1720a54370d1d320873b63743fd0e60e6de8f9ec35890ba', 137660),
    sourceItem('mock1_l_18', '2f165d60e7992b5e4cd7368c14bd4e9d42d1d928204a71236c5d5566a8b81296', '8602055cea1ecf0e8b6ac931b278a009a4258f43ccdad5fd02abb62bd4de2aca', 123716),
    sourceItem('mock1_l_19', 'e5ad116b4f330f34c76ba49966d071e7a9e7f0c41c593b9129fd98d3f9600923', '5ee414bf69d3da8467749db1db92beb1944d73574284b522bd2d7f6091df3020', 96668),
    sourceItem('mock1_l_20', 'aa060bd882d1179841ee9c170a87a3d0081c16b055e5fcbf84e66b09716e9c78', '848de0e95c6762bdd5bf90b053eeba2e389c1535fa44502eb18c3d6157f3eb75', 110084),
    sourceItem('mock1_l_21', '590480470987e6e8b29da17eb3e109f389a736056370510e93b0897bdacd7491', '5954daa31b7c93a044612366fdd77b6123bb89d5671032558ec604d9ed1e51b4', 92180),
    sourceItem('mock1_l_22', '36190c832ecc02a65fad3540551e90af6916bc3434a6fdc66c33c71c6b4cc045', 'aab5bea8f9267ad5847d891dc01d13f5ad948e67f2ee294e1ec60809b157f613', 85604),
    sourceItem('mock1_l_23', '977f72a29cbdc1af02243d93814ef68856fc1407b9382ded27445aee30cdb57f', '1255ad9ad1a104cebd4a45aedcc3a80e18161792ca02f66391401136b7a06455', 92324),
    sourceItem('mock1_l_24', 'be4e0fa173bc41f8b0c2be68e2e5fb170208b33377b4f93a58c94b1a978af54b', '3719a0c4172d885254e9604185b62b4f015ed7828fa6608f41c3f496384b81b5', 92564),
    sourceItem('mock1_l_25', '11087462a969474a0d12272532f083a0ada02be9cdea12c7c044671c0d7034b4', '133f33cd7e90b84ec0574a92729e0302a24ea5c84c7fb645f6869952e06b95eb', 100796),
    sourceItem('mock1_l_26', '6af0fa0ecd2c5a8d73148d666f4c354d7346235ddee0ad6166c1b5c96387f441', '9ea2f13d731de27d02d3fe1f7f063883db2f757de7bbef32029c5c9d5c60eac8', 97484),
    sourceItem('mock1_l_27', '6b6959cca71910017e32e2c756a1eb889c65b392151200ade2e200dc90c25935', '34ddc2894130fbcd8a503ae7034c2c4fbb6e62f24ee553d4d109b2109fe1e7bf', 115580),
    sourceItem('mock1_l_28', '47fa54095a258a12172d1e4818b5ff687243a9be29f3a76cabc78d32084a3671', 'c40e6f31691cf3fc8a7edb9983aa0f7ee53d175610e0a46d4da47ad5cb570fba', 96212),
]);

const OFFICIAL_ITEMS = Object.freeze([
    officialItem('p1-i1', 'task-comprehension', 18, 1, 'n3-mock-listening-01-action', 'n3-action-01', 'listening:n3-action-state'),
    officialItem('p1-i2', 'task-comprehension', 18, 1, 'n3-mock-listening-01-action', 'n3-action-02', 'listening:n3-action-state'),
    officialItem('p2-i1', 'point-comprehension', 19, 2, 'n3-mock-listening-02-point', 'n3-point-01', 'listening:n3-distractor-elimination'),
    officialItem('p2-i2', 'point-comprehension', 19, 2, 'n3-mock-listening-02-point', 'n3-point-02', 'listening:n3-key-point'),
    officialItem('p3-i1', 'overview-comprehension', 20, 3, 'n3-mock-listening-03-overview', 'n3-overview-01', 'listening:n3-overview-intent'),
    officialItem('p4-i1', 'expression-choice', 21, 3, 'n3-mock-listening-04-expression', 'n3-expression-01', 'speaking:n3-register'),
    officialItem('p5-i1', 'quick-response', 22, 3, 'n3-mock-listening-05-response', 'n3-response-01', 'listening:n3-response-implication'),
    officialItem('p5-i2', 'quick-response', 22, 4, 'n3-mock-listening-05-response', 'n3-response-02', 'speaking:n3-turn-response'),
]);

const SOYA_RECORDS = SOYA_MEDIA.map((item, index) => {
    const placement = placementForSoyaIndex(index);
    return Object.freeze({
        id: `soya:n3-mock1:${item.id}`,
        sourceFamily: 'soya' as const,
        source: Object.freeze({
            locator: `data/courses/jlpt_n3/mock1_listening.js#n3_mock1_listening[id=${item.id}]`,
            artifactSha256: SOYA_SOURCE_SHA256,
            itemSha256: item.itemSha256,
        }),
        level: 'N3' as const,
        skill: 'listening' as const,
        function: placement.mechanic,
        rights: Object.freeze({
            verdict: 'blocked-no-redistribution-record' as const,
            evidence: 'Private research availability and a reachable origin do not establish redistribution permission.',
            evidenceLocator: 'research-root:soya-research#licence-scan-no-redistribution-record',
            checkedOn: '2026-07-20' as const,
        }),
        wording: Object.freeze({ verdict: 'not-shippable-adapt-mechanic-only' as const }),
        answer: Object.freeze({ availability: 'available-static' as const, verdict: 'verified-single-answer' as const }),
        media: Object.freeze({
            availability: 'available-private-static' as const,
            verdict: 'not-shippable' as const,
            locator: item.audioLocator,
            sha256: item.audioSha256,
            bytes: item.audioBytes,
        }),
        adaptation: Object.freeze({
            decision: 'original-yomu-mechanic-adaptation' as const,
            note: `For ${item.id}, preserve only the audited listening function; deliver new Yomu wording, distractors, explanation, and browser speech.`,
            sourceContentReuse: 'none' as const,
            packageId: placement.packageId,
            learnerItemId: placement.learnerItemId,
            learnerSkills: learnerSkillsFor(placement.mechanic),
        }),
        canonical: Object.freeze({
            conceptId: SOYA_LEARNER_CONCEPTS[index]!,
            srsIdentity: `srs:cur007:${placement.learnerItemId}`,
        }),
        reachability: Object.freeze({
            lessonId: `advanced:${placement.packageId}` as const,
            status: 'learner-route' as const,
        }),
    });
});

const OFFICIAL_RECORDS = OFFICIAL_ITEMS.map(item => Object.freeze({
    id: `official-jlpt:n3-2009-listening:${item.id}`,
    sourceFamily: 'official-jlpt' as const,
    source: Object.freeze({
        locator: `N3-mondai.pdf#page=${item.questionPage};N3-script.pdf#page=${item.scriptPage};N3-seikai.pdf#listening-${item.id}`,
        artifactSha256: OFFICIAL_QUESTION_SHA256,
        companionArtifactSha256: Object.freeze([OFFICIAL_SCRIPT_SHA256, OFFICIAL_ANSWER_SHA256, OFFICIAL_AUDIO_SHA256]),
    }),
    level: 'N3' as const,
    skill: 'listening' as const,
    function: item.mechanic,
    rights: Object.freeze({
        verdict: 'blocked-publication-use-not-cleared' as const,
        evidence: 'The official site policy protects sample works, identifies possible third-party rights, and does not establish public-app publication permission for this use.',
        evidenceLocator: 'https://www.jlpt.jp/e/policy.html',
        checkedOn: '2026-07-20' as const,
    }),
    wording: Object.freeze({ verdict: 'not-shippable-format-calibration-only' as const }),
    answer: Object.freeze({ availability: 'available-official-key' as const, verdict: 'verified-single-answer' as const }),
    media: Object.freeze({
        availability: 'available-official-public' as const,
        verdict: 'not-shippable' as const,
        locator: `N3Sample.mp3#${item.id}`,
        sha256: OFFICIAL_AUDIO_SHA256,
        bytes: 11570390,
    }),
    adaptation: Object.freeze({
        decision: 'format-calibration-only' as const,
        note: `For official sample ${item.id}, calibrate only format and answer shape; deliver new Yomu wording, distractors, explanation, and browser speech.`,
        sourceContentReuse: 'none' as const,
        packageId: item.packageId,
        learnerItemId: item.learnerItemId,
        learnerSkills: learnerSkillsFor(item.mechanic),
    }),
    canonical: Object.freeze({
        conceptId: item.conceptId,
        srsIdentity: `srs:cur007:${item.learnerItemId}`,
    }),
    reachability: Object.freeze({
        lessonId: `advanced:${item.packageId}` as const,
        status: 'learner-route' as const,
    }),
}));

export const CUR007_N3_MOCK_LISTENING_AUDIT: Cur007N3BatchAudit = Object.freeze({
    schema: 'yomu-academy.cur007-n3-audit/v1',
    batchId: 'cur-007-n3-mock-listening-v1',
    reviewedOn: '2026-07-20',
    denominator: Object.freeze({
        total: 36,
        soya: 28,
        official: 8,
        byFunction: Object.freeze({
            'task-comprehension': Object.freeze({ soya: 6, official: 2 }),
            'point-comprehension': Object.freeze({ soya: 6, official: 2 }),
            'overview-comprehension': Object.freeze({ soya: 3, official: 1 }),
            'expression-choice': Object.freeze({ soya: 4, official: 1 }),
            'quick-response': Object.freeze({ soya: 9, official: 2 }),
        }),
    }),
    globalSoyaQuestionMap: Object.freeze({
        total: 487,
        reviewedBeforeBatch: 2,
        overlapWithBatch: 1,
        newlyReviewed: 27,
        reviewedAfterBatch: 29,
        remaining: 458,
    }),
    records: Object.freeze([...SOYA_RECORDS, ...OFFICIAL_RECORDS]),
});

export function validateCur007N3BatchAudit(audit: Cur007N3BatchAudit = CUR007_N3_MOCK_LISTENING_AUDIT): readonly string[] {
    const issues: string[] = [];
    if (audit.records.length !== audit.denominator.total) issues.push('The audit record count must equal the frozen denominator.');
    const ids = new Set(audit.records.map(record => record.id));
    if (ids.size !== audit.records.length) issues.push('Every audit item id must be unique.');
    const soya = audit.records.filter(record => record.sourceFamily === 'soya');
    const official = audit.records.filter(record => record.sourceFamily === 'official-jlpt');
    if (soya.length !== audit.denominator.soya || official.length !== audit.denominator.official) {
        issues.push('Soya and official item counts must match the denominator.');
    }
    for (const [mechanic, counts] of Object.entries(audit.denominator.byFunction) as Array<[N3MockListeningMechanic, { soya: number; official: number }]>) {
        if (soya.filter(record => record.function === mechanic).length !== counts.soya
            || official.filter(record => record.function === mechanic).length !== counts.official) {
            issues.push(`The ${mechanic} item count is incomplete.`);
        }
    }
    audit.records.forEach(record => validateRecord(record, issues));
    if (audit.globalSoyaQuestionMap.reviewedBeforeBatch - audit.globalSoyaQuestionMap.overlapWithBatch
        + audit.denominator.soya !== audit.globalSoyaQuestionMap.reviewedAfterBatch
        || audit.globalSoyaQuestionMap.total - audit.globalSoyaQuestionMap.reviewedAfterBatch
        !== audit.globalSoyaQuestionMap.remaining) {
        issues.push('The global Soya remainder arithmetic is inconsistent.');
    }
    return Object.freeze(issues);
}

function validateRecord(record: Cur007CandidateAuditRecord, issues: string[]): void {
    const value = JSON.stringify(record);
    if (value.includes('/Users/') || value.includes('sourceWording')) issues.push(`${record.id} leaks private or source-content data.`);
    if (!/^[a-f0-9]{64}$/u.test(record.source.artifactSha256)
        || (record.source.itemSha256 !== undefined && !/^[a-f0-9]{64}$/u.test(record.source.itemSha256))
        || record.source.companionArtifactSha256?.some(hash => !/^[a-f0-9]{64}$/u.test(hash))
        || !/^[a-f0-9]{64}$/u.test(record.media.sha256)) {
        issues.push(`${record.id} has invalid hash evidence.`);
    }
    if (record.media.verdict !== 'not-shippable'
        || !record.wording.verdict.startsWith('not-shippable-')
        || record.skill !== 'listening'
        || record.rights.checkedOn !== CUR007_N3_MOCK_LISTENING_AUDIT.reviewedOn
        || !record.rights.evidenceLocator
        || record.adaptation.sourceContentReuse !== 'none'
        || record.adaptation.note.length < 20
        || !record.adaptation.learnerSkills.includes('listening')
        || record.reachability.lessonId !== `advanced:${record.adaptation.packageId}`) {
        issues.push(`${record.id} violates the fail-closed delivery contract.`);
    }
}

function sourceItem(id: string, itemSha256: string, audioSha256: string, audioBytes: number) {
    return Object.freeze({ id, itemSha256, audioLocator: `/audio/mock1/${id}.mp3`, audioSha256, audioBytes });
}

function officialItem(
    id: string,
    mechanic: N3MockListeningMechanic,
    questionPage: number,
    scriptPage: number,
    packageId: N3MockListeningPackageId,
    learnerItemId: string,
    conceptId: string,
) {
    return Object.freeze({ id, mechanic, questionPage, scriptPage, packageId, learnerItemId, conceptId });
}

function placementForSoyaIndex(index: number): Readonly<{
    mechanic: N3MockListeningMechanic;
    packageId: N3MockListeningPackageId;
    learnerItemId: string;
}> {
    if (index < 6) return placement('task-comprehension', 'n3-mock-listening-01-action', 'action', index + 1);
    if (index < 12) return placement('point-comprehension', 'n3-mock-listening-02-point', 'point', index - 5);
    if (index < 15) return placement('overview-comprehension', 'n3-mock-listening-03-overview', 'overview', index - 11);
    if (index < 19) return placement('expression-choice', 'n3-mock-listening-04-expression', 'expression', index - 14);
    return placement('quick-response', 'n3-mock-listening-05-response', 'response', index - 18);
}

function placement(
    mechanic: N3MockListeningMechanic,
    packageId: N3MockListeningPackageId,
    slug: string,
    ordinal: number,
) {
    return Object.freeze({ mechanic, packageId, learnerItemId: `n3-${slug}-${String(ordinal).padStart(2, '0')}` });
}

function learnerSkillsFor(mechanic: N3MockListeningMechanic): readonly ('listening' | 'speaking')[] {
    return mechanic === 'expression-choice' || mechanic === 'quick-response'
        ? Object.freeze(['listening', 'speaking'] as const)
        : Object.freeze(['listening'] as const);
}
