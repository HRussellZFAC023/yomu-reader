import type { LearningAction, LearningSkill } from '../domain/learner-record';

export interface N3StoryPractice {
    readonly activityId: string;
    readonly chapterId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly conceptIds: readonly string[];
    readonly prompt: Readonly<{ en: string; ja: string }>;
    readonly options: readonly Readonly<{ id: string; label: Readonly<{ en: string; ja: string }> }>[];
    readonly correctOptionId: string;
    readonly repair: Readonly<{ en: string; ja: string }>;
}

const PRACTICES: readonly N3StoryPractice[] = Object.freeze([
    practice('activity:story-n3:after-applause-tone', 's3e01-after-the-applause', 'listening', 'repair',
        ['concept:story-n3:reported-tone'],
        '「検討させていただきます」 leaves which fact open?',
        '「検討させていただきます」は、どの事実を保留にしていますか。', [
            ['decision-open', 'The decision has not been made.', 'まだ決定していない。'],
            ['decision-yes', 'The invitation was accepted.', '招待を受けた。'],
            ['decision-no', 'The invitation was refused.', '招待を断った。'],
        ], 'decision-open',
        'Keep the polite wording separate from a decision that was never stated.',
        '丁寧な言い方と、まだ述べられていない決定を分けましょう。'),
    practice('activity:story-n3:caption-provenance', 's3e02-caption-without-owner', 'reading', 'recall',
        ['concept:story-n3:attribution-gap'],
        'Which note keeps the caption usable without inventing an author?',
        '作者を作り出さずに、キャプションを使える形にするメモはどれですか。', [
            ['unknown-author', 'Author unknown; source record still needs checking.', '作者不明。出典記録は要確認。'],
            ['guess-author', 'Probably written by the earliest class.', '最初のクラスが書いたと思われる。'],
            ['remove-gap', 'No attribution issue remains.', '帰属の問題はもうない。'],
        ], 'unknown-author',
        'An absent author field is evidence of uncertainty, not permission to fill the gap.',
        '作者欄がないことは不確実さの証拠であり、空白を埋めてよい理由ではありません。'),
    practice('activity:story-n3:voice-preserving-edit', 's3e03-helpful-rewrite', 'writing', 'produce',
        ['concept:story-n3:register-preserving-edit'],
        'Choose the edit request that preserves Peter’s voice and asks before publication.',
        'Peterさんの声を残し、公開前に確認する編集依頼を選んでください。', [
            ['ask-and-mark', 'Keep this phrase; may I mark one unclear part for you to decide?', 'この表現は残して、一か所だけ不明な部分を印してもいいですか。'],
            ['replace-all', 'I made it natural, so I replaced every sentence.', '自然にしたので、全部書き換えました。'],
            ['publish-first', 'I will post it now and explain later.', '先に公開して、あとで説明します。'],
        ], 'ask-and-mark',
        'Repair the unclear phrase without replacing the person who wrote it.',
        '分かりにくい表現は直しても、書いた人の代わりにならないようにしましょう。'),
    practice('activity:story-n3:invitation-scope', 's3e04-terms-of-invitation', 'reading', 'recall',
        ['concept:story-n3:consent-scope'],
        'Which first reply lets each learner make an informed choice about the invitation?',
        '招待について、各自が十分な情報をもとに選べる最初の返事はどれですか。', [
            ['scope-first', 'Ask for the purpose, audience, and approval terms.', '目的、対象者、承認条件を確認する。'],
            ['accept-all', 'Accept for the whole class so planning can start.', '準備のため、クラス全体で承諾する。'],
            ['record-anyway', 'Assume recording is fine unless someone objects.', '反対がなければ録画してよいと考える。'],
        ], 'scope-first',
        'A class invitation is not consent until each person knows what is being asked and can answer for themselves.',
        'クラスへの招待でも、何を求められているかを知り、各自が返答できるまで同意にはなりません。'),
    practice('activity:story-n3:opt-in-seat', 's3e05-chair-not-reserved', 'listening', 'repair',
        ['concept:story-n3:opt-in-attendance'],
        'Which change keeps a seat available without assigning Sam to it?',
        'Samさんを割り当てずに席を用意しておく変更はどれですか。', [
            ['hold-open', 'Mark it open for a volunteer; ask Sam only if needed.', '希望者用とし、必要な場合に限りSamさんに聞く。'],
            ['keep-name', 'Keep Sam’s name because the intention was kind.', '善意だったのでSamさんの名前を残す。'],
            ['announce-role', 'Tell everyone Sam will speak unless he declines.', 'Samさんが断るまで、話すことにすると伝える。'],
        ], 'hold-open',
        'Making space is generous; assigning a person to the space is a separate decision.',
        '場所を用意することは親切でも、そこに人を割り当てることは別の決定です。'),
    practice('activity:story-n3:conditional-schedule', 's3e06-two-schedules', 'writing', 'produce',
        ['concept:story-n3:conditional-commitment'],
        'Choose the update that is useful without presenting an unconfirmed date as fact.',
        '未確認の日程を事実のように扱わず、役に立つ更新を選んでください。', [
            ['mark-pending', 'Candidate date under review; update by 17:00.', '候補日を確認中。本日17時までに更新。'],
            ['announce-date', 'The preferred date is confirmed.', '希望の日程が確定しました。'],
            ['hide-status', 'No need to mention the mismatch.', '予定の違いは書かなくてよい。'],
        ], 'mark-pending',
        'When dates disagree, promise the next confirmation rather than a date nobody has confirmed.',
        '日程が一致しないときは、誰も確認していない日付ではなく、次の確認を約束しましょう。'),
]);

export function n3StoryPractice(activityId: string): N3StoryPractice | undefined {
    return PRACTICES.find(practice => practice.activityId === activityId);
}

export function allN3StoryPractices(): readonly N3StoryPractice[] {
    return PRACTICES;
}

function practice(
    activityId: string,
    chapterId: string,
    skill: LearningSkill,
    action: LearningAction,
    conceptIds: readonly string[],
    en: string,
    ja: string,
    options: readonly (readonly [string, string, string])[],
    correctOptionId: string,
    repairEn: string,
    repairJa: string,
): N3StoryPractice {
    return Object.freeze({
        activityId,
        chapterId,
        skill,
        action,
        conceptIds: Object.freeze([...conceptIds]),
        prompt: Object.freeze({ en, ja }),
        options: Object.freeze(options.map(([id, optionEn, optionJa]) => Object.freeze({
            id,
            label: Object.freeze({ en: optionEn, ja: optionJa }),
        }))),
        correctOptionId,
        repair: Object.freeze({ en: repairEn, ja: repairJa }),
    });
}
