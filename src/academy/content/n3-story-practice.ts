import type { LearningAction, LearningSkill } from '../domain/learner-record';

interface StoryPracticeBase {
    readonly activityId: string;
    readonly chapterId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly conceptIds: readonly string[];
    readonly prompt: Readonly<{ en: string; ja: string }>;
    readonly repair: Readonly<{ en: string; ja: string }>;
    readonly reviewAnswer: Readonly<{ en: string; ja: string }>;
}

export interface StoryChoicePractice extends StoryPracticeBase {
    readonly interaction: 'choice';
    readonly options: readonly Readonly<{ id: string; label: Readonly<{ en: string; ja: string }> }>[];
    readonly correctOptionId: string;
}

export interface StoryEvidenceMapPractice extends StoryPracticeBase {
    readonly interaction: 'evidence-map';
    readonly columns: readonly Readonly<{
        id: 'source' | 'confidence' | 'hedge';
        label: Readonly<{ en: string; ja: string }>;
        options: readonly Readonly<{ id: string; label: Readonly<{ en: string; ja: string }> }>[];
    }>[];
    readonly rows: readonly Readonly<{
        id: string;
        claim: Readonly<{ en: string; ja: string }>;
        correct: Readonly<Record<'source' | 'confidence' | 'hedge', string>>;
    }>[];
}

export interface StoryWrittenResponsePractice extends StoryPracticeBase {
    readonly interaction: 'written-response';
    readonly fields: readonly Readonly<{
        id: string;
        label: Readonly<{ en: string; ja: string }>;
        placeholder: string;
        requiredTermGroups: readonly (readonly string[])[];
    }>[];
    readonly forbiddenTerms: readonly string[];
}

export type StoryPractice = StoryChoicePractice | StoryEvidenceMapPractice | StoryWrittenResponsePractice;

export type StoryPracticeResponse =
    | Readonly<{ interaction: 'choice'; optionId: string }>
    | Readonly<{
        interaction: 'evidence-map';
        rows: Readonly<Record<string, Readonly<Record<'source' | 'confidence' | 'hedge', string>>>>;
    }>
    | Readonly<{ interaction: 'written-response'; fields: Readonly<Record<string, string>> }>;

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
    evidenceMapPractice(),
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
    writtenFuturesPractice(),
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

export function gradeStoryPractice(practice: StoryPractice, response: StoryPracticeResponse): 'pass' | 'lapse' {
    return storyPracticeMistakeIds(practice, response).length === 0 ? 'pass' : 'lapse';
}

export function storyPracticeMistakeIds(practice: StoryPractice, response: StoryPracticeResponse): readonly string[] {
    if (practice.interaction !== response.interaction) return ['interaction'];
    if (practice.interaction === 'choice' && response.interaction === 'choice') {
        return response.optionId === practice.correctOptionId ? [] : ['choice'];
    }
    if (practice.interaction === 'evidence-map' && response.interaction === 'evidence-map') {
        return practice.rows.flatMap(row => {
            const answer = response.rows[row.id];
            return practice.columns.flatMap(column => answer?.[column.id] === row.correct[column.id]
                ? []
                : [`${row.id}:${column.id}`]);
        });
    }
    if (practice.interaction === 'written-response' && response.interaction === 'written-response') {
        return practice.fields.flatMap(field => {
            const value = response.fields[field.id]?.trim() ?? '';
            const incomplete = value.length < 4
                || field.requiredTermGroups.some(group => !group.some(term => value.includes(term)));
            const ranksFuture = practice.forbiddenTerms.some(term => value.includes(term));
            return incomplete || ranksFuture ? [field.id] : [];
        });
    }
    return ['interaction'];
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
): StoryChoicePractice {
    const correct = options.find(([id]) => id === correctOptionId);
    if (!correct) throw new TypeError(`Story practice ${activityId} has no correct option.`);
    return Object.freeze({
        interaction: 'choice' as const,
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
        reviewAnswer: Object.freeze({ en: correct[1], ja: correct[2] }),
    });
}

function evidenceMapPractice(): StoryEvidenceMapPractice {
    return Object.freeze({
        interaction: 'evidence-map' as const,
        activityId: 'activity:s4e02-map-of-claims-evidence-map',
        chapterId: 's4e02-map-of-claims',
        skill: 'writing' as const,
        action: 'produce' as const,
        conceptIds: Object.freeze(['concept:story-n1:source-bounded-claim']),
        prompt: Object.freeze({
            en: 'Build the evidence map. Give every claim its source, confidence, and Japanese evidence phrase.',
            ja: '根拠の地図を作ってください。各主張に、出典・確かさ・日本語の根拠表現を付けましょう。',
        }),
        columns: Object.freeze([
            mapColumn('source', 'Source', '出典', [
                ['letter', 'Former learner\'s letter', '以前の学習者の手紙'],
                ['paper', 'Physical page', '紙そのもの'],
                ['none', 'No supporting source', '裏付ける資料なし'],
            ]),
            mapColumn('confidence', 'Confidence', '確かさ', [
                ['stated', 'Directly stated', '本人が明記'],
                ['observed', 'Directly observed', '資料から確認'],
                ['unknown', 'Unknown', 'まだ不明'],
            ]),
            mapColumn('hedge', 'Evidence phrase', '根拠表現', [
                ['according-letter', '手紙によると', '手紙によると'],
                ['paper-shows', '紙を見ると', '紙を見ると'],
                ['still-unknown', 'まだ分からない', 'まだ分からない'],
            ]),
        ]),
        rows: Object.freeze([
            mapRow('route-added', 'The former learner added a route.', '以前の学習者が道を足した。', 'letter', 'stated', 'according-letter'),
            mapRow('older-ink', 'The page has layers of older ink.', '紙には古いインクの層がある。', 'paper', 'observed', 'paper-shows'),
            mapRow('first-contributor', 'The identity of the first contributor.', '最初の寄稿者が誰か。', 'none', 'unknown', 'still-unknown'),
        ]),
        repair: Object.freeze({
            en: 'Recheck each source. The letter states the route addition, the page shows older ink, and neither identifies the first contributor.',
            ja: '出典をもう一度確認しましょう。道の追加は手紙、古いインクは紙から確認できます。最初の寄稿者を示す資料はありません。',
        }),
        reviewAnswer: Object.freeze({
            en: 'According to the letter, the learner added a route. The page shows older ink. The first contributor is still unknown.',
            ja: '手紙によると、その学習者は道を足した。紙を見ると古いインクの層がある。最初の寄稿者はまだ分からない。',
        }),
    });
}

function writtenFuturesPractice(): StoryWrittenResponsePractice {
    return Object.freeze({
        interaction: 'written-response' as const,
        activityId: 'activity:s4e07-journey-not-everyone-takes-non-comparative-futures',
        chapterId: 's4e07-journey-not-everyone-takes',
        skill: 'writing' as const,
        action: 'produce' as const,
        conceptIds: Object.freeze(['concept:story-n1:non-comparative-futures']),
        prompt: Object.freeze({
            en: 'Write three short Japanese updates. Keep Alex decided, Aakash possible, and Mira staying and restarting. Do not rank them.',
            ja: '三人の短い予定を日本語で書いてください。アレックスは決定、アーカシュは可能性、ミラは残って再開。順位は付けません。',
        }),
        fields: Object.freeze([
            writtenField('alex', 'Alex: decided next month', 'アレックス：来月に決まった予定', '決まった時期を含む一文', [['来月'], ['日本', '働', '仕事']]),
            writtenField('aakash', 'Aakash: a genuine maybe', 'アーカシュ：まだ可能性', '「いつか」と不確かさを含む一文', [['いつか'], ['かもしれ', 'たい', 'たら', 'まだ', '分から', 'わから']]),
            writtenField('mira', 'Mira: staying and restarting Tuesday', 'ミラ：残って火曜に再開', '残ることと再開を含む一文', [['火曜', '来週'], ['再開', 'また', '始め'], ['残', 'こっち', 'ここ']]),
        ]),
        forbiddenTerms: Object.freeze(['一歩先', '追いつ', '上って', '上だ', '勇気がある', '偉い']),
        repair: Object.freeze({
            en: 'Use a decided time for Alex, an uncertainty marker for Aakash, and both staying and restarting language for Mira. Leave comparison out.',
            ja: 'アレックスには決まった時期、アーカシュには不確かさ、ミラには残ることと再開を書く。比較は入れません。',
        }),
        reviewAnswer: Object.freeze({
            en: 'Alex starts next month. Aakash may travel someday. Mira is staying and restarting Tuesday.',
            ja: 'アレックスは来月から日本で働く。アーカシュはいつか撮り旅に行くかもしれない。ミラはここに残って、来週火曜からまた始める。',
        }),
    });
}

function mapColumn(
    id: 'source' | 'confidence' | 'hedge',
    en: string,
    ja: string,
    options: readonly (readonly [string, string, string])[],
): StoryEvidenceMapPractice['columns'][number] {
    return Object.freeze({
        id,
        label: Object.freeze({ en, ja }),
        options: Object.freeze(options.map(([optionId, optionEn, optionJa]) => Object.freeze({
            id: optionId,
            label: Object.freeze({ en: optionEn, ja: optionJa }),
        }))),
    });
}

function mapRow(
    id: string,
    en: string,
    ja: string,
    source: string,
    confidence: string,
    hedge: string,
): StoryEvidenceMapPractice['rows'][number] {
    return Object.freeze({
        id,
        claim: Object.freeze({ en, ja }),
        correct: Object.freeze({ source, confidence, hedge }),
    });
}

function writtenField(
    id: string,
    en: string,
    ja: string,
    placeholder: string,
    requiredTermGroups: readonly (readonly string[])[],
): StoryWrittenResponsePractice['fields'][number] {
    return Object.freeze({
        id,
        label: Object.freeze({ en, ja }),
        placeholder,
        requiredTermGroups: Object.freeze(requiredTermGroups.map(group => Object.freeze([...group]))),
    });
}
