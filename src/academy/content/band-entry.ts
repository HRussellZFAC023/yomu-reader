import type { ChoiceActivityModel, ChoiceOption } from '../activities/choice';
import type { JlptBand } from '../domain/learner-record';

interface BandEntryDefinition {
    readonly conceptId: string;
    readonly prompt: ChoiceActivityModel['prompt'];
    readonly reviewContent: ChoiceActivityModel['payload']['reviewContent'];
    readonly options: readonly ChoiceOption[];
}

const BAND_ENTRY_DEFINITIONS: Readonly<Record<JlptBand, BandEntryDefinition>> = {
    n5: {
        conceptId: 'concept:n5-time-reading',
        prompt: {
            en: 'Rie says: 「授業は七時半に始まります。」 When does class begin?',
            ja: 'りえ先生が「授業は七時半に始まります」と言いました。授業は何時に始まりますか。',
        },
        reviewContent: {
            expression: '七時半に始まります。',
            reading: 'しちじはんにはじまります',
            meanings: ['It begins at 7:30.'],
        },
        options: [
            correct('seven-thirty', '7:30', '七時半', '七時半 means half past seven.', '「七時半」は、七時から三十分後です。'),
            wrong('seven', '7:00', '七時',
                ['The sentence includes 半, so it is later than seven.', '文には「半」があるので、七時より三十分後です。'],
                ['Focus on 半: it adds thirty minutes.', '「半」は三十分です。'],
                ['七時半 is 7:30.', '七時半は7:30です。'], 'half-hour-missed'),
            wrong('eight-thirty', '8:30', '八時半',
                ['The hour is 七, not 八.', '時刻の数字は「八」ではなく「七」です。'],
                ['Focus on the first number, 七.', '最初の数字「七」に注目してください。'],
                ['八時半 would mean 8:30.', '八時半なら8:30です。'], 'hour-confusion'),
        ],
    },
    n4: {
        conceptId: 'concept:n4-conditional-plan',
        prompt: {
            en: 'Rie says: 「雨が降ったら、カフェで待っていてください。」 What should you do if it rains?',
            ja: 'りえ先生が「雨が降ったら、カフェで待っていてください」と言いました。雨が降ったとき、どうしますか。',
        },
        reviewContent: {
            expression: '雨が降ったら、カフェで待っていてください。',
            reading: 'あめがふったら、かふぇでまっていてください',
            meanings: ['If it rains, please wait at the cafe.'],
        },
        options: [
            correct('wait-cafe', 'Wait at the cafe.', 'カフェで待ちます。', 'The たら-clause sets the rain condition; the requested action is waiting at the cafe.', '「たら」は条件を示し、頼まれた行動はカフェで待つことです。'),
            wrong('go-library', 'Go to the library.', '図書館へ行きます。',
                ['The sentence names the cafe, not the library.', '文に出てくる場所は、図書館ではなくカフェです。'],
                ['Focus on カフェで, the location of the action.', '場所を表す「カフェで」に注目してください。'],
                ['図書館で待ってください would mean “Please wait at the library.”', '図書館なら「図書館で待ってください」と言います。'], 'location-confusion'),
            wrong('leave-cafe', 'Leave the cafe.', 'カフェを出ます。',
                ['待っていて asks you to remain and wait.', '「待っていて」は、その場所で待ち続けるよう頼む表現です。'],
                ['Choose the action expressed by 待つ.', '「待つ」の行動を選んでください。'],
                ['ここで待っていてください means “Please wait here.”', '「ここで待っていてください」は、ここで待つよう頼む表現です。'], 'action-confusion'),
        ],
    },
    n3: {
        conceptId: 'concept:n3-hearsay-inference',
        prompt: {
            en: 'You hear: 「Alexさんは来ると言っていましたが、電車が止まったらしいです。」 What is supported by the message?',
            ja: '「Alexさんは来ると言っていましたが、電車が止まったらしいです。」この文から分かることは何ですか。',
        },
        reviewContent: {
            expression: '電車が止まったらしいです。',
            reading: 'でんしゃがとまったらしいです',
            meanings: ['It seems / I heard that the train stopped.'],
        },
        options: [
            correct('train-report', 'There is a report that Alex’s train stopped.', 'Alexさんの電車が止まったという情報があります。', 'らしい marks reported or indirect information; the message does not claim direct observation.', '「らしい」は、聞いた情報や間接的な根拠を示します。'),
            wrong('alex-cancelled', 'Alex definitely decided not to come.', 'Alexさんは絶対に来ないと決めました。',
                ['The message reports a stopped train, not a definite decision by Alex.', '文が伝えているのは電車の停止で、Alexさんの決定ではありません。'],
                ['Separate what the sentence reports from what you might infer.', '文が伝える情報と、そこから推測できることを分けてください。'],
                ['The sentence never says 「来ないと決めた」.', '「来ないと決めた」とは書かれていません。'], 'inference-overreach'),
            wrong('speaker-saw', 'The speaker personally saw the train stop.', '話し手が電車の停止を直接見ました。',
                ['らしい does not establish direct observation.', '「らしい」だけでは、話し手が直接見たとは言えません。'],
                ['Consider what kind of information source らしい signals.', '「らしい」が示す情報源を考えてください。'],
                ['Direct observation could be 「電車が止まるのを見ました」.', '直接見たなら「電車が止まるのを見ました」と言えます。'], 'evidence-source-confusion'),
        ],
    },
    n2: {
        conceptId: 'concept:n2-qualified-stance',
        prompt: {
            en: 'Read: 「計画に問題がないとは言えないが、今すぐ中止する必要はない。」 Which stance is closest?',
            ja: '「計画に問題がないとは言えないが、今すぐ中止する必要はない。」筆者の立場に最も近いものを選んでください。',
        },
        reviewContent: {
            expression: '問題がないとは言えない',
            reading: 'もんだいがないとはいえない',
            meanings: ['It cannot be said that there are no problems.'],
        },
        options: [
            correct('qualified-continue', 'There are concerns, but immediate cancellation is not justified.', '懸念はあるが、すぐに中止すべきだとは考えていません。', 'The writer concedes possible problems, then rejects the need for immediate cancellation.', '問題の可能性を認めた上で、即時中止の必要性は否定しています。'),
            wrong('no-problems', 'The plan has no problems.', '計画には問題がありません。',
                ['ないとは言えない leaves open the possibility of problems.', '「ないとは言えない」は、問題がある可能性を残します。'],
                ['Focus on the scoped double negative ないとは言えない.', '二重否定の「ないとは言えない」に注目してください。'],
                ['安全だとは言えない means “We cannot say it is safe.”', '「安全だとは言えない」は、安全だと断定できないという意味です。'], 'negation-scope'),
            wrong('cancel-now', 'The plan must be cancelled immediately.', '計画は今すぐ中止しなければなりません。',
                ['The second clause explicitly says immediate cancellation is unnecessary.', '後半は、今すぐ中止する必要を明確に否定しています。'],
                ['Check what 必要はない negates.', '「必要はない」が何を否定しているか確認してください。'],
                ['急ぐ必要はない means “There is no need to hurry.”', '「急ぐ必要はない」は、急がなくてもよいという意味です。'], 'concession-missed'),
        ],
    },
    n1: {
        conceptId: 'concept:n1-implicit-motive',
        prompt: {
            en: 'Read: 「彼が返事をしなかったのは、同意したからというより、反論するほどの確信がなかったからだ。」 What does the writer infer?',
            ja: '「彼が返事をしなかったのは、同意したからというより、反論するほどの確信がなかったからだ。」筆者は何を推測していますか。',
        },
        reviewContent: {
            expression: '同意したからというより',
            reading: 'どういしたからというより',
            meanings: ['Rather than because he agreed…'],
        },
        options: [
            correct('uncertain-silence', 'His silence reflected insufficient confidence to object, not clear agreement.', '沈黙は明確な同意ではなく、反論する確信の不足を示していました。', 'というより rejects agreement as the main explanation and replaces it with uncertainty.', '「というより」は前の説明を退け、より適切な説明を示します。'),
            wrong('clear-agreement', 'His silence proved complete agreement.', '沈黙は全面的な同意を証明しました。',
                ['The sentence treats agreement as the less fitting explanation.', '文は、同意をより適切でない説明として退けています。'],
                ['Read the explanation after 同意したからというより.', '「同意したからというより」の後にある説明を読んでください。'],
                ['賛成というより、反対する理由がなかった means “Rather than support, there was no reason to oppose.”', '「賛成というより、反対する理由がなかった」も、最初の説明を言い換える表現です。'], 'implicit-meaning-reversed'),
            wrong('certain-objection', 'He was certain the other person was wrong.', '彼は相手が間違っていると確信していました。',
                ['The sentence says he lacked enough confidence to object.', '文は、反論するほどの確信がなかったと述べています。'],
                ['Check the negation in 確信がなかった.', '「確信がなかった」の否定を確認してください。'],
                ['自信がなかったので、何も言えませんでした means “I lacked confidence, so I could not say anything.”', '「自信がなかったので、何も言えませんでした」も、不確かさが沈黙につながる例です。'], 'negation-missed'),
        ],
    },
};

export function createBandEntryActivity(band: JlptBand): ChoiceActivityModel {
    const definition = BAND_ENTRY_DEFINITIONS[band];
    return {
        id: `activity:band-entry:${band}`,
        kind: 'choice',
        conceptIds: [definition.conceptId],
        responseKind: 'choice',
        prompt: definition.prompt,
        payload: {
            options: definition.options,
            reviewSeedId: `review:band-entry:${band}`,
            reviewContent: definition.reviewContent,
        },
    };
}

export function bandEntrySceneId(band: JlptBand): string {
    return `scene:band-entry:${band}`;
}

function correct(id: string, en: string, ja: string, explanationEn: string, explanationJa: string): ChoiceOption {
    return {
        id,
        label: { en, ja },
        correct: true,
        explanation: { en: explanationEn, ja: explanationJa },
    };
}

function wrong(
    id: string,
    en: string,
    ja: string,
    explanation: readonly [en: string, ja: string],
    repair: readonly [en: string, ja: string],
    example: readonly [en: string, ja: string],
    errorTag: string,
): ChoiceOption {
    return {
        id,
        label: { en, ja },
        correct: false,
        errorTag,
        explanation: { en: explanation[0], ja: explanation[1] },
        repairPrompt: { en: repair[0], ja: repair[1] },
        nearbyExample: { en: example[0], ja: example[1] },
    };
}
