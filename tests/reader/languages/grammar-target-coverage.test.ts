import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LEARNER_LANGUAGES, type LearnerLanguageId } from '../../../src/reader/locales';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import { learningTargetModuleFor } from '../../../src/reader/languages/registry';
import { detectGrammarHints, renderGrammarHints } from '../../../src/reader/study/tools-impl';

interface GrammarFixture {
    readonly target: LearnerLanguageId;
    readonly ruleId: string;
    readonly positive: string;
    readonly nearNegative: string;
}

/** Release promise only; production derives support from each Adapter's rules. */
const EXPECTED_CURATED_TARGET_IDS = LEARNER_LANGUAGES.map(language => language.id);
const CEFR_TARGET_IDS = ['de', 'en', 'es', 'fr', 'ru'] as const satisfies readonly LearnerLanguageId[];
const FOUNDATION_TARGET_IDS = [
    'sq', 'grc', 'ar', 'yue', 'da', 'nl', 'fi', 'el', 'hu', 'id', 'it', 'km', 'ko',
    'lo', 'la', 'mn', 'fa', 'pl', 'pt', 'ro', 'sh', 'sv', 'tl', 'th', 'vi',
] as const satisfies readonly LearnerLanguageId[];

const GRAMMAR_FIXTURES: readonly GrammarFixture[] = [
    { target: 'sq', ruleId: 'sq-existential-ka-ketu', positive: 'Ka mace këtu.', nearNegative: 'Ai ka mace.' },
    { target: 'grc', ruleId: 'grc-negation-ou', positive: 'ὁ βίος οὐ βιωτὸς.', nearNegative: 'Οὐδεὶς ποιῶν πονερὰ λανθάνει θεόν.' },
    { target: 'ar', ruleId: 'ar-msa-laysa-negation', positive: 'البيت ليس كبيرًا.', nearNegative: 'ذهب إلى اليسار.' },
    { target: 'yue', ruleId: 'yue-copular-negation-m-haih', positive: '佢唔係學生。', nearNegative: '佢唔想讀書。' },
    { target: 'zh', ruleId: 'zh-hsk3-yuelaiyue', positive: '天氣越來越冷了。', nearNegative: '天氣越冷，風越大。' },
    { target: 'da', ruleId: 'da-presentative-der-er', positive: 'Der er en bog på bordet.', nearNegative: 'Jeg læser en bog, der er en klassiker.' },
    { target: 'nl', ruleId: 'nl-presentative-er-is-zijn', positive: 'Er is een probleem.', nearNegative: 'Er is gewerkt.' },
    { target: 'en', ruleId: 'en-a1-there-is-are', positive: 'There are two cafés nearby.', nearNegative: 'Their two cafés are nearby.' },
    { target: 'fi', ruleId: 'fi-adessive-possession', positive: 'Minulla on rahaa.', nearNegative: 'Minulle on kirje.' },
    { target: 'el', ruleId: 'el-indicative-negation-den', positive: 'Δεν είναι εδώ.', nearNegative: 'Δένει το σχοινί.' },
    { target: 'hu', ruleId: 'hu-dative-possession-van', positive: 'Nekem van tollam.', nearNegative: 'Nekem nincs tollam.' },
    { target: 'id', ruleId: 'id-negative-existential-tidak-ada', positive: 'Tidak ada burung di pohon itu.', nearNegative: 'Saya tidak suka burung.' },
    { target: 'it', ruleId: 'it-presentative-ci', positive: 'C’è un problema.', nearNegative: 'Ci sono andato ieri.' },
    { target: 'km', ruleId: 'km-discontinuous-negation', positive: 'ខ្ញុំមិនទៅទេ។', nearNegative: 'ខ្ញុំមិនទៅ។' },
    { target: 'ko', ruleId: 'ko-desire-go-sipda', positive: '한국에 가고 싶어요.', nearNegative: '이 음식은 먹고 싶게 보여요.' },
    { target: 'lo', ruleId: 'lo-preverbal-negation-bo', positive: 'ຂ້ອຍບໍ່ໄປ.', nearNegative: 'ຂ້ອຍໄປບໍ?' },
    { target: 'la', ruleId: 'la-negative-copula-non-est', positive: 'Bellum non est bellum.', nearNegative: 'Nonne bellum est?' },
    { target: 'mn', ruleId: 'mn-nominal-negation-bish', positive: 'Энэ миний ном биш.', nearNegative: 'Энэ миний ном мөн.' },
    { target: 'fa', ruleId: 'fa-negative-long-copula', positive: 'این کتاب خوب نیست.', nearNegative: 'این کتاب خوب است.' },
    { target: 'pl', ruleId: 'pl-negative-existential-nie-ma', positive: 'W naszym mieście nie ma muzeów.', nearNegative: 'Nie mam muzeum.' },
    { target: 'pt', ruleId: 'pt-existential-ha', positive: 'Há três pessoas na sala.', nearNegative: 'Há três anos moro aqui.' },
    { target: 'ro', ruleId: 'ro-necessity-trebuie-sa', positive: 'Trebuie să învăț.', nearNegative: 'Îmi trebuie un caiet.' },
    { target: 'sh', ruleId: 'sh-existential-nema-genitive', positive: 'Nema kave.', nearNegative: 'On nema kavu.' },
    { target: 'sv', ruleId: 'sv-presentative-det-finns', positive: 'Det finns en bok på bordet.', nearNegative: 'Det finns kvar.' },
    { target: 'tl', ruleId: 'tl-existential-may-mayroon', positive: 'May aklat sa mesa.', nearNegative: 'Walang aklat sa mesa.' },
    { target: 'th', ruleId: 'th-copular-negation-mai-chai', positive: 'เขาไม่ใช่ครู', nearNegative: 'เขาไม่ชอบครู' },
    { target: 'tr', ruleId: 'tr-a1-a2-existence-var-yok', positive: 'Sınıfta tahta var.', nearNegative: 'Bu tahta çok büyük.' },
    { target: 'vi', ruleId: 'vi-completed-da-roi', positive: 'Tôi đã ăn cơm rồi.', nearNegative: 'Tôi đã ăn cơm.' },

    { target: 'es', ruleId: 'es-me-gusta-infinitive', positive: 'Me gusta bailar.', nearNegative: 'Me gusta el baile.' },
    { target: 'es', ruleId: 'es-existential-hay', positive: 'Hay tres personas.', nearNegative: 'Hay que estudiar.' },
    { target: 'es', ruleId: 'es-causal-porque', positive: 'Estudio español porque mi novio es de Cáceres.', nearNegative: '¿Por qué estudias español?' },
    { target: 'es', ruleId: 'es-negation-no', positive: 'No soy español.', nearNegative: 'No hay problema.' },
    { target: 'es', ruleId: 'es-present-perfect', positive: 'He estado en tu casa.', nearNegative: 'Hay una casa.' },
    { target: 'es', ruleId: 'es-estar-gerundio', positive: 'Está hablando por teléfono.', nearNegative: 'Está cansado.' },
    { target: 'es', ruleId: 'es-tener-que', positive: 'Tengo que estudiar.', nearNegative: 'Tengo quejas hoy.' },
    { target: 'es', ruleId: 'es-ir-a-infinitive', positive: 'Voy a escribirle.', nearNegative: 'Voy al cine.' },

    { target: 'fr', ruleId: 'fr-present-progressive', positive: 'Nous sommes en train de manger.', nearNegative: 'Le train de Paris est en retard.' },
    { target: 'fr', ruleId: 'fr-near-future', positive: 'Je vais manger plus tard.', nearNegative: 'Je vais à Paris.' },
    { target: 'fr', ruleId: 'fr-recent-past', positive: 'Je viens de finir mon travail.', nearNegative: 'Elle vient de Chypre.' },
    { target: 'fr', ruleId: 'fr-est-ce-que-question', positive: 'Est-ce que tu viens ?', nearNegative: 'C’est ce que je veux.' },
    { target: 'fr', ruleId: 'fr-ne-pas-negation', positive: 'Je ne parle pas anglais.', nearNegative: 'Pas de problème.' },
    { target: 'fr', ruleId: 'fr-il-faut-infinitive', positive: 'Il faut bien apprendre ses leçons.', nearNegative: 'Il faut du temps.' },
    { target: 'fr', ruleId: 'fr-polite-conditional', positive: 'Je voudrais un café.', nearNegative: 'Je veux un café.' },
    { target: 'fr', ruleId: 'fr-existential-il-y-a', positive: 'Il y a un canapé et un fauteuil dans le salon.', nearNegative: 'Il y a un an.' },

    { target: 'de', ruleId: 'de-a1-es-gibt', positive: 'Es gibt hier einen Bahnhof.', nearNegative: 'Das Ergebnis ergibt sich später.' },
    { target: 'de', ruleId: 'de-a1-modal-infinitive', positive: 'Wir müssen heute gehen.', nearNegative: 'Die Kanne steht auf dem Tisch.' },
    { target: 'de', ruleId: 'de-a1-von-bis', positive: 'Ich arbeite von 9 Uhr bis 17 Uhr.', nearNegative: 'Die Seiten von 25 bis 29 fehlen.' },
    { target: 'de', ruleId: 'de-a1-so-wie', positive: 'Der Bus ist so schnell wie die Bahn.', nearNegative: 'Die Arbeit ist so gut wie fertig.' },
    { target: 'de', ruleId: 'de-a1-comparative-als', positive: 'Der Zug ist schneller als der Bus.', nearNegative: 'Er arbeitet als Lehrer.' },
    { target: 'de', ruleId: 'de-a1-aber-denn', positive: 'Ich komme, aber ich bleibe nicht lange.', nearNegative: 'Das Aber stört mich.' },
    { target: 'de', ruleId: 'de-a1-einladen', positive: 'Wir laden euch morgen ein.', nearNegative: 'Wir laden eine Datei.' },

    { target: 'ru', ruleId: 'ru-a1-kto-chto-eto', positive: 'Кто это?', nearNegative: 'Кто это сделал?' },
    { target: 'ru', ruleId: 'ru-a1-possessive-starter', positive: 'Это моя сумка.', nearNegative: 'Мой руки!' },
    { target: 'ru', ruleId: 'ru-a1-request-imperative', positive: 'Скажите, пожалуйста, где метро?', nearNegative: 'Он скажет завтра.' },
    { target: 'ru', ruleId: 'ru-a1-dative-nravitsya', positive: 'Мне нравится эта книга.', nearNegative: 'Она понравилась мне.' },
    { target: 'ru', ruleId: 'ru-a1-potomu-chto', positive: 'Я дома, потому что идёт дождь.', nearNegative: 'Почему ты дома?' },
    { target: 'ru', ruleId: 'ru-a1-gde-mozhno-infinitive', positive: 'Где можно купить билет?', nearNegative: 'Где можно конфетти?' },
    { target: 'ru', ruleId: 'ru-a1-want-can-infinitive', positive: 'Я хочу пойти в музей.', nearNegative: 'У меня есть желание.' },
    { target: 'ru', ruleId: 'ru-a1-need-infinitive', positive: 'Вам нужно пойти к врачу.', nearNegative: 'Мне нужна новая книга.' },
];

afterEach(() => {
    resetActiveLearningTargetLanguage();
    vi.unstubAllGlobals();
});

describe('target grammar catalogue', () => {
    it('gives every roster target a checked reference and keeps reference-only capability honest', () => {
        const stateCounts = { curated: 0, referenceOnly: 0, nothing: 0 };
        const actualCurated: LearnerLanguageId[] = [];

        for (const language of LEARNER_LANGUAGES) {
            const target = learningTargetModuleFor(language.id);
            expect(target, language.id).not.toBeNull();
            expect(target?.grammar.referenceUrl, language.id).toMatch(/^https:\/\//u);
            const hasRules = Boolean(target?.grammar.rules.length);
            if (hasRules) {
                stateCounts.curated++;
                actualCurated.push(language.id);
            } else if (target?.grammar.referenceUrl) stateCounts.referenceOnly++;
            else stateCounts.nothing++;
            expect(target?.capabilities.grammar, language.id).toBe(hasRules);
        }

        expect(stateCounts).toEqual({ curated: 32, referenceOnly: 0, nothing: 0 });
        expect(actualCurated.sort()).toEqual([...EXPECTED_CURATED_TARGET_IDS].sort());
        expect(JAPANESE_LEARNING_TARGET.grammar.referenceUrl).toBe('https://www.tofugu.com/japanese-grammar/');
    });

    it('documents every exact runtime reference URL', () => {
        const docs = readFileSync('docs/reference/grammar.md', 'utf8');
        const targets = [
            JAPANESE_LEARNING_TARGET,
            ...LEARNER_LANGUAGES.map(language => learningTargetModuleFor(language.id)),
        ];

        for (const target of targets) {
            expect(target, 'all roster targets are registered').not.toBeNull();
            expect(docs, target?.language).toContain(`(${target?.grammar.referenceUrl})`);
        }
    });

    it('preserves the established Japanese JLPT scale', () => {
        expect(JAPANESE_LEARNING_TARGET.grammar.levelScale).toEqual({
            id: 'jlpt',
            levels: ['Core', 'N5', 'N4', 'N3', 'N2', 'N1'],
        });
    });

    it.each(CEFR_TARGET_IDS)('uses the source-published CEFR scale for %s', targetId => {
        expect(learningTargetModuleFor(targetId)?.grammar.levelScale, targetId).toEqual({
            id: 'cefr',
            levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
        });
    });

    it('uses the source-published HSK Standard Course scale for Chinese', () => {
        expect(learningTargetModuleFor('zh')?.grammar.levelScale).toEqual({
            id: 'hsk-standard-course',
            levels: ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'],
        });
    });

    it('keeps the published Turkish A1–A2 band instead of inventing one exact CEFR level', () => {
        expect(learningTargetModuleFor('tr')?.grammar.levelScale).toEqual({
            id: 'tr-yee-cefr-band',
            levels: ['A1–A2'],
        });
    });

    it.each(FOUNDATION_TARGET_IDS)('uses an honest target-specific Foundation scale for %s', targetId => {
        const scale = learningTargetModuleFor(targetId)?.grammar.levelScale;
        expect(scale?.id, targetId).toMatch(new RegExp(`^${targetId}(?:-|$)`, 'u'));
        expect(scale?.levels, targetId).toEqual(['Foundation']);
    });

    it('has a positive and near-negative check for every shipped starter rule', () => {
        const fixtureIds = new Set(GRAMMAR_FIXTURES.map(fixture => fixture.ruleId));
        const ruleIds = EXPECTED_CURATED_TARGET_IDS.flatMap(target => (
            learningTargetModuleFor(target)?.grammar.rules.map(rule => rule.ruleId) ?? []
        ));
        expect([...fixtureIds].sort()).toEqual([...ruleIds].sort());
    });

    it('ships reviewed English and Japanese names for every new rule', () => {
        for (const targetId of EXPECTED_CURATED_TARGET_IDS) {
            for (const rule of learningTargetModuleFor(targetId)?.grammar.rules ?? []) {
                expect(rule.displayNames?.en, rule.ruleId).toBeTruthy();
                expect(rule.displayNames?.ja, rule.ruleId).toBeTruthy();
            }
        }
    });

    it('keeps the corrected French and Russian curriculum page anchors explicit', () => {
        const frenchUrls = Object.fromEntries(
            learningTargetModuleFor('fr')?.grammar.rules.map(rule => [rule.ruleId, rule.url]) ?? [],
        );
        expect(frenchUrls).toMatchObject({
            'fr-present-progressive': expect.stringMatching(/#page=66$/u),
            'fr-existential-il-y-a': expect.stringMatching(/#page=67$/u),
        });

        const russianPages = learningTargetModuleFor('ru')?.grammar.rules.map(rule => rule.url.match(/#page=(\d+)$/u)?.[1]);
        expect(russianPages).toEqual(['19', '19', '20', '21', '22', '22', '23', '24']);
    });

    it.each(GRAMMAR_FIXTURES)('$target / $ruleId detects only the checked surface', fixture => {
        const grammar = learningTargetModuleFor(fixture.target)?.grammar;
        expect(grammar).toBeDefined();
        expect(grammar?.detect(fixture.positive).map(match => match.ruleId)).toContain(fixture.ruleId);
        expect(grammar?.detect(fixture.nearNegative).map(match => match.ruleId)).not.toContain(fixture.ruleId);
    });

    it('routes shared detection through the active target without a language branch', () => {
        const spanish = setActiveLearningTargetLanguage('es');
        if (!spanish) throw new TypeError('Spanish target was not registered.');
        expect(spanish.grammar.detect('Tengo que estudiar.')).toEqual([
            expect.objectContaining({ ruleId: 'es-tener-que', level: 'A2' }),
        ]);

        const korean = setActiveLearningTargetLanguage('ko');
        if (!korean) throw new TypeError('Korean target was not registered.');
        expect(korean.capabilities.grammar).toBe(true);
        expect(korean.grammar.detect('한국에 가고 싶어요.')).toEqual([
            expect.objectContaining({ ruleId: 'ko-desire-go-sipda', level: 'Foundation' }),
        ]);
        expect(korean.grammar.referenceUrl).toBe(
            'https://krdict.korean.go.kr/eng/dicSearch/SearchView?ParaWordNo=62657',
        );
    });

    it.each([
        ['es-me-gusta-infinitive', 'Me gusta ir.'],
        ['es-tener-que', 'Tengo que ir.'],
        ['es-ir-a-infinitive', 'Voy a ir.'],
        ['es-present-perfect', 'He ido.'],
        ['es-estar-gerundio', 'Está yendo.'],
    ])('covers the checked short Spanish form for %s', (ruleId, sentence) => {
        const ids = learningTargetModuleFor('es')?.grammar.detect(sentence).map(match => match.ruleId);
        expect(ids).toContain(ruleId);
    });

    it('keeps the German modal and separable-verb starter rules conservative', () => {
        const grammar = learningTargetModuleFor('de')?.grammar;
        expect(grammar?.detect('Können Sie morgen kommen?').map(match => match.ruleId))
            .toContain('de-a1-modal-infinitive');
        expect(grammar?.detect('Wir wollen pünktlich sein.').map(match => match.ruleId))
            .toContain('de-a1-modal-infinitive');
        expect(grammar?.detect('Ich will einen Garten.').map(match => match.ruleId))
            .not.toContain('de-a1-modal-infinitive');
        expect(grammar?.detect('Wir laden ein Auto.').map(match => match.ruleId))
            .not.toContain('de-a1-einladen');
        expect(grammar?.detect('Ich will, dass wir morgen gehen.').map(match => match.ruleId))
            .not.toContain('de-a1-modal-infinitive');
    });

    it('keeps the Russian modal starter on the checked infinitives', () => {
        const grammar = learningTargetModuleFor('ru')?.grammar;
        expect(grammar?.detect('Я знаю, что это правда.').map(match => match.ruleId))
            .not.toContain('ru-a1-kto-chto-eto');
        expect(grammar?.detect('Хотите пойти со мной?').map(match => match.ruleId))
            .toContain('ru-a1-want-can-infinitive');
        expect(grammar?.detect('Я хочу новые пути.').map(match => match.ruleId))
            .not.toContain('ru-a1-want-can-infinitive');
        expect(grammar?.detect('Я хочу мороженое, а он решил пойти.').map(match => match.ruleId))
            .not.toContain('ru-a1-want-can-infinitive');
    });

    it('keeps the Russian necessity starter on the checked source example', () => {
        const grammar = learningTargetModuleFor('ru')?.grammar;
        expect(grammar?.detect('Вам нужно пойти к врачу.').map(match => match.ruleId))
            .toContain('ru-a1-need-infinitive');
        expect(grammar?.detect('Мне нужно конфетти.').map(match => match.ruleId))
            .not.toContain('ru-a1-need-infinitive');
    });

    it('does not label an ordinary French possibility as polite', () => {
        const grammar = learningTargetModuleFor('fr')?.grammar;
        expect(grammar?.detect('On pourrait avoir l’addition, s’il vous plaît.').map(match => match.ruleId))
            .toContain('fr-polite-conditional');
        expect(grammar?.detect('J’aimerais un café.').map(match => match.ruleId))
            .toContain('fr-polite-conditional');
        expect(grammar?.detect('On pourrait tomber si le sol est mouillé.').map(match => match.ruleId))
            .not.toContain('fr-polite-conditional');
        expect(grammar?.detect('On pourrait avoir un accident.').map(match => match.ruleId))
            .not.toContain('fr-polite-conditional');
        expect(grammar?.detect('Il y a un an.').map(match => match.ruleId))
            .not.toContain('fr-existential-il-y-a');
    });

    it('rejects Spanish proper names that resemble verb forms', () => {
        const grammar = learningTargetModuleFor('es')?.grammar;
        expect(grammar?.detect('Me gusta Pilar.').map(match => match.ruleId))
            .not.toContain('es-me-gusta-infinitive');
        expect(grammar?.detect('Ahí está Fernando.').map(match => match.ruleId))
            .not.toContain('es-estar-gerundio');
    });

    it('renders a reviewed Japanese label for a non-Japanese target rule', async () => {
        if (!setActiveLearningTargetLanguage('es')) throw new TypeError('Spanish target was not registered.');
        const sentence = 'Tengo que estudiar.';
        const html = await renderGrammarHints(
            detectGrammarHints(sentence),
            sentence,
            { knownRuleIds: [], showKnown: true },
            'ja',
        );

        expect(html).toContain('tener que ＋ 不定詞');
        expect(html).not.toContain('Obligation with tener que');
    });

    it('resolves automatic Japanese before rendering grammar copy', async () => {
        vi.stubGlobal('navigator', { languages: ['ja-JP', 'en-GB'], language: 'ja-JP' });
        if (!setActiveLearningTargetLanguage('es')) throw new TypeError('Spanish target was not registered.');
        const sentence = 'Tengo que estudiar.';
        const html = await renderGrammarHints(
            detectGrammarHints(sentence),
            sentence,
            { knownRuleIds: [], showKnown: true },
            'auto',
        );

        expect(html).toContain('tener que ＋ 不定詞');
        expect(html).toContain('文法');
        expect(html).not.toContain('Obligation with tener que');
        expect(html).not.toContain('Grammar pattern');
    });
});
