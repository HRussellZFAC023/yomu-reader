import type { LearningAction, LearningSkill } from '../domain/learner-record';

export interface StoryPractice {
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

/** Compatibility name for the original six N3 story practices. */
export type N3StoryPractice = StoryPractice;

const PRACTICES: readonly StoryPractice[] = Object.freeze([
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
    practice('activity:s4e02-map-of-claims-evidence-map', 's4e02-map-of-claims', 'reading', 'transfer',
        ['concept:story-n1:source-bounded-claim'],
        'The letter says the former learner added a route. The paper shows older ink, but neither source names the first contributor. Which evidence-map entry stays within those sources?',
        '手紙には、以前の学習者が道を足したとあります。紙には古いインクの跡がありますが、どちらの資料にも最初の寄稿者は書かれていません。資料の範囲を越えない記録はどれですか。', [
            ['source-bounded', 'According to the letter, the learner added a route. The first contributor is not mentioned in either source.', '手紙によると、その学習者は道を足した。最初の寄稿者については、どちらの資料にも記載がない。'],
            ['infer-founder', 'The old ink probably belongs to the first contributor named in the letter.', '古いインクは、手紙に出てくる最初の寄稿者のものらしい。'],
            ['refusal-as-proof', 'Because one question was declined, the missing name must be that person.', '一つの質問への回答が控えられたので、記載のない名前はその人に違いない。'],
        ], 'source-bounded',
        'Keep each claim inside what its named source states or supports. A declined answer does not license an inference past the boundary.',
        '主張は、示した資料が述べている範囲にとどめましょう。回答を控えたことは、その先を推測してよい理由にはなりません。'),
    practice('activity:s4e04-three-true-versions-synthesis', 's4e04-three-true-versions', 'reading', 'recognise',
        ['concept:story-n1:compatible-accounts'],
        'Rie remembers handing over a blank sheet; the former learner remembers receiving one with a route; the class saw later additions. Which synthesis keeps all three vantage points and the unwitnessed interval?',
        'リエは白紙を渡したと覚え、以前の学習者は道が一本ある紙を受け取ったと書き、今のクラスはその後の書き足しを見ています。三つの視点と、誰も見ていない間を残すまとめはどれですか。', [
            ['three-vantages', 'According to Rie it was blank when handed over; the letter says it already had a route when received; the class record shows later additions. What happened between the first two accounts remains unknown.', 'リエによれば、渡した時は白紙だった。手紙では、受け取った時には道が一本あったという。今のクラスの記録には、その後の書き足しが残る。最初の二つの間に何があったかは、まだ分からない。'],
            ['teacher-wins', 'Rie handed over a blank sheet, so the other two accounts must be mistaken.', 'リエが白紙を渡したのだから、ほかの二つの記録は間違っている。'],
            ['merge-speakers', 'The page began blank, already had a route, and kept growing, according to everyone.', 'みんなによると、その紙は白紙で始まり、すでに道があり、増え続けていた。'],
        ], 'three-vantages',
        'Attribute every clause to its vantage point and leave the unwitnessed interval open.',
        '一つ一つの節を、その場面を見た人に結びつけ、誰も見ていない間は埋めずに残しましょう。'),
    practice('activity:s4e05-left-unsaid-trim-the-line', 's4e05-left-unsaid', 'reading', 'recognise',
        ['concept:story-n1:public-private-ellipsis'],
        'The public draft says: 「この一区画は、あえて空けてあります。書いた人は街を離れ、続きを書けなかったと考えられます。」 The second sentence is inferred and has no publication permission. Which stage line holds the deliberate blank without publishing the private reason?',
        '公開用の原稿には「この一区画は、あえて空けてあります。書いた人は街を離れ、続きを書けなかったと考えられます」とあります。二文目は推測で、公開の許可もありません。空白が意図したものだと伝えつつ、私的な理由を出さない台詞はどれですか。', [
            ['stop-at-blank', '「この一区画は、あえて空けてあります。」 Then pause.', '「この一区画は、あえて空けてあります。」そこで一度、間を置く。'],
            ['publish-inference', '「この一区画は、書いた人が街を離れたため、空いています。」', '「この一区画は、書いた人が街を離れたため、空いています。」'],
            ['hint-at-secret', '「この一区画には、ここでは言えない理由があります。」', '「この一区画には、ここでは言えない理由があります。」'],
        ], 'stop-at-blank',
        'The public line can name the deliberate blank. It must not publish or tease an unpermitted private explanation.',
        '公開の台詞では、意図して空けたことまで言えます。許可のない私的な理由を出したり、秘密らしく匂わせたりはしません。'),
    practice('activity:s4e06-open-question-reframe-premise', 's4e06-open-question', 'reading', 'recognise',
        ['concept:story-n1:false-premise-reframe'],
        'The rehearsal line says 「このアトラスを作ったのは、＿＿です」, but the routes, captions, and photographs came from different people. Which response challenges the one-owner premise without dismissing anyone?',
        'リハーサルの台詞は「このアトラスを作ったのは、＿＿です」ですが、道、文章、写真は別々の人から来ています。誰も否定せずに、一人の作者を求める前提を問い直す言い方はどれですか。', [
            ['reframe-question', 'Even if no signatures had survived, the atlas would still be complete. Perhaps the question asking for one name is wrong.', '「もし署名が一つもなくても、このアトラスは完成していたはずです。そもそも、一人の名前を入れる質問が合っていないのでは？」'],
            ['pick-most-work', 'Why not name the person who revised the most?', '「いちばん多く直した人を作者にすればいいのでは？」'],
            ['erase-unknown', 'Remove the unknown contributions and reduce it to one name.', '「分からない人の分は外して、一人にまとめましょう。」'],
        ], 'reframe-question',
        'Use the counterfactual to test the premise, then question the sentence that demands one name.',
        '反実仮想で前提を確かめてから、一人の名前を求める文そのものを問い直しましょう。'),
    practice('activity:s4e07-journey-not-everyone-takes-non-comparative-futures', 's4e07-journey-not-everyone-takes', 'reading', 'recognise',
        ['concept:story-n1:non-comparative-futures'],
        'Alex starts work in Japan next month. Aakash may take a camera trip someday. Mira is staying where she is and restarting a twenty-minute review next Tuesday. Which line keeps all three futures in their own modality without ranking them?',
        'アレックスは来月から日本で働きます。アーカシュの撮影旅行は、まだ「いつか」の話です。ミラは今いる場所に残り、来週火曜に二十分の復習を再開します。三人の未来を比べず、それぞれの確かさで言う文はどれですか。', [
            ['side-by-side', 'Alex starts next month. Aakash may travel someday. Mira is staying and restarting Tuesday. Each is their own plan.', '「アレックスは来月から。アーカシュは、いつか行くかもしれない。ミラはここに残って、火曜からまた始める。どれも、その人の予定だね。」'],
            ['departure-wins', 'Alex is one step ahead; the other two still have to catch up.', '「アレックスが一歩先で、ほかの二人はこれからだね。」'],
            ['force-certainty', 'All three have decided their next step.', '「三人とも、もう次の予定が決まったね。」'],
        ], 'side-by-side',
        'Preserve decided, possible, and staying plans as different valid futures. Do not place them on one ladder.',
        '決まったこと、まだ分からないこと、残ることを、それぞれ別の未来として保ちましょう。一つの順位には並べません。'),
    practice('activity:s4e08-last-revision-vivid-without-restoring', 's4e08-last-revision', 'reading', 'recognise',
        ['concept:story-n1:bounded-public-edit'],
        'The draft reads 「この道は、戻らなかった人の願いを受け継ぎ、今夜も灯る。」 The middle clause restores a withdrawn claim. Which revision stays vivid without restoring it?',
        '草稿は「この道は、戻らなかった人の願いを受け継ぎ、今夜も灯る」です。真ん中の節は、外したはずの話を戻しています。その話を戻さず、鮮やかさを残す直しはどれですか。', [
            ['vivid-bounded', '「この道は、今夜も静かに灯る。」', '「この道は、今夜も静かに灯る。」'],
            ['restore-softly', '「この道は、ある人の願いらしきものを受け継ぎ、今夜も灯る。」', '「この道は、ある人の願いらしきものを受け継ぎ、今夜も灯る。」'],
            ['flatten-line', '「道があります。」 It avoids the claim by removing every image.', '「道があります。」主張を避けるため、像もすべて外す。'],
        ], 'vivid-bounded',
        'Keep the image in language the sources permit. Softening an unpermitted claim does not make it publishable.',
        '資料が許す言葉の中で、像を残しましょう。許可のない主張は、ぼかしても公開できる主張にはなりません。'),
]);

export function n3StoryPractice(activityId: string): N3StoryPractice | undefined {
    if (!activityId.startsWith('activity:story-n3:')) return undefined;
    return storyPractice(activityId);
}

export function storyPractice(activityId: string): StoryPractice | undefined {
    return PRACTICES.find(practice => practice.activityId === activityId);
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
): StoryPractice {
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
