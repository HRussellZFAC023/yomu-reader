import type {
    StoryActivityBinding,
    StoryArcNode,
    StoryArcScene,
    StoryEpisode,
    StoryPlayableArc,
} from './story-runtime';

interface N3ArcRecord {
    readonly episode: StoryEpisode;
    readonly arc: StoryPlayableArc;
}

const records: readonly N3ArcRecord[] = Object.freeze([
    episode('s3e01-after-the-applause', 25, 'After the Applause', 'academy-library', ['mika', 'francis'],
        'A public invitation arrives, but its polite wording has not settled what the venue means.',
        'Mika and Francis compare what they heard without promoting inference into fact.',
        'activity:story-n3:after-applause-tone', 'reported-tone', [
            stage('stage:after-applause:invitation', 'A quiet invitation sits beside the finished exhibition route.'),
            line('line:after-applause:mika', 'mika', 'Mika reads the reply twice, then stops before calling it good news.',
                '「検討させていただきます」って、断りではないよね。でも、決まりでもない。',
                '「検討させていただく」とのお返事でした。拒否ではありませんが、決定とも受け取れません。'),
            line('line:after-applause:francis', 'francis', 'Francis asks the useful question instead of supplying an answer.',
                '誰が、何を、どこまで言ったかを分けよう。聞こえたことと、思ったことも。',
                '発言者、内容、確度を分けましょう。聞き取れた事実と推測も区別します。'),
            activity('activity-node:after-applause:tone', 'activity:story-n3:after-applause-tone', 'listening', 'line:after-applause:repair'),
            line('line:after-applause:repair', 'mika', 'Mika writes a reply that confirms the next step without pretending a decision exists.',
                'じゃあ、返事は「検討の結果を教えてください」にする。勝手に予定にしない。',
                'では、検討結果をご連絡いただけるか伺います。予定として扱うのは避けましょう。'),
            choice('choice:after-applause:reply', 'What should the class ask for next?', [
                ['option:after-applause:confirm-scope', 'Ask what can be shared now.', '今、共有できる範囲を伺う。', '現在共有可能な範囲をご確認する。'],
                ['option:after-applause:assume-date', 'Assume the date is confirmed.', '日程は決まったことにする。', '日程は確定したものとして扱う。'],
            ]),
            line('line:after-applause:close', 'francis', 'The reply remains a question. The invitation can wait without becoming a refusal.',
                '決まっていないことを、急いで決めたことにしなくていい。',
                '未決定の事柄を、急いで確定事項にする必要はありません。'),
        ]),
    episode('s3e02-caption-without-owner', 26, 'A Caption Without an Owner', 'academy-library', ['rose', 'henry'],
        'Rose finds an old caption with no reliable author field.',
        'Henry treats missing provenance as an honest boundary rather than a mystery to solve by guesswork.',
        'activity:story-n3:caption-provenance', 'provenance-gap', [
            stage('stage:caption:folder', 'A copied caption rests beside a blank author field.'),
            line('line:caption:rose', 'rose', 'Rose notices that the words survive while the record does not.',
                '文章は残っている。でも、誰の言葉かを示す欄だけが空いている。',
                '文面は残っていますが、発言者を示す記録だけが欠けています。'),
            line('line:caption:henry', 'henry', 'Henry refuses the tempting shortcut.',
                '古いからといって、最初のクラスのものだとは言えないよ。分からない、と書ける。',
                '古いという理由だけで最初のクラスの著作とは断定できません。不明であると記録できます。'),
            activity('activity-node:caption:provenance', 'activity:story-n3:caption-provenance', 'reading', 'line:caption:repair'),
            line('line:caption:repair', 'rose', 'Rose labels the uncertainty and keeps the caption out of the public draft.',
                '作者不明、出典確認中。公開用の原稿には入れない。',
                '作者不明、出典確認中と記載し、公開用原稿からは外します。'),
            choice('choice:caption:next', 'What is the next responsible action?', [
                ['option:caption:trace-record', 'Trace the record before reuse.', '記録をたどってから使う。', '記録を確認してから再利用する。'],
                ['option:caption:credit-class', 'Credit the current class instead.', '今のクラスの名前にする。', '現在のクラス名で掲載する。'],
            ]),
            line('line:caption:close', 'henry', 'The gap stays visible, and the atlas gains a question instead of a false answer.',
                '空白を残すのも、記録の仕事だね。',
                '空白を残すことも、記録の責任です。'),
        ]),
    episode('s3e03-helpful-rewrite', 27, 'The Helpful Rewrite', 'academy-classroom', ['peter', 'sophie'],
        'A polished rewrite makes Peter’s contribution sound unlike him.',
        'Sophie separates repair from replacement and asks what Peter wants preserved.',
        'activity:story-n3:voice-preserving-edit', 'voice-preserving-edit', [
            stage('stage:rewrite:two-drafts', 'Two drafts lie side by side. One is smoother; one is recognizably Peter’s.'),
            line('line:rewrite:peter', 'peter', 'Peter can read the polished draft, but cannot find his own decision in it.',
                '直っているのは分かる。でも、これを選んだ理由まで消えている。',
                '表現が整ったことは分かりますが、選択した理由まで失われています。'),
            line('line:rewrite:sophie', 'sophie', 'Sophie names the boundary without blaming the editor.',
                '分かりにくい所を直すのと、書いた人の代わりに話すのは違う。まず、残したい所を聞こう。',
                '不明瞭な箇所を修正することと、執筆者に代わって語ることは別です。残したい部分を先に伺いましょう。'),
            activity('activity-node:rewrite:voice', 'activity:story-n3:voice-preserving-edit', 'writing', 'line:rewrite:repair'),
            line('line:rewrite:repair', 'peter', 'Peter keeps one phrase and invites one marked question.',
                'この言い方は残したい。分かりにくい一か所だけ、質問として印を付けて。',
                'この表現は残したいです。不明瞭な一箇所だけ、質問として印を付けてください。'),
            choice('choice:rewrite:publish', 'What does the editor do before publication?', [
                ['option:rewrite:confirm', 'Return the marked draft for Peter’s decision.', '印を付けた原稿をPeterさんに戻す。', '印を付けた原稿をPeterさんの確認に戻す。'],
                ['option:rewrite:publish', 'Publish the polished version first.', '整えた原稿を先に公開する。', '整えた原稿を先に公開する。'],
            ]),
            line('line:rewrite:close', 'sophie', 'The edit becomes an invitation to decide, not a substitution.',
                '助けるなら、選ぶ場所を残そう。',
                '支援するなら、選択する余地を残しましょう。'),
        ]),
    episode('s3e04-terms-of-invitation', 28, 'Terms of Invitation', 'academy-classroom', ['ruparna', 'aakash'],
        'The venue asks to hear from learners, but has not named its audience, recording policy, or approval route.',
        'Ruparna turns an exciting invitation into terms that each learner can actually accept or decline.',
        'activity:story-n3:invitation-scope', 'consent-scope', [
            stage('stage:terms:email', 'An invitation email is open beside a draft reply with three blank headings.'),
            line('line:terms:ruparna', 'ruparna', 'Ruparna likes the invitation, then notices what it leaves unnamed.',
                '話すのはいい。でも、誰に向けて、録画するのか、先に分からないと選べない。',
                'お話しすること自体には前向きです。ただし、聴衆、記録の有無、承認手順を先に確認しなければ選択できません。'),
            line('line:terms:aakash', 'aakash', 'Aakash offers a structure without deciding for anyone else.',
                '目的と聞く人、それから確認する機会。そこを書いて、返事は各自に任せよう。',
                '目的、対象者、確認の機会を明記しましょう。その上で、参加の返答は各自の判断に委ねます。'),
            activity('activity-node:terms:scope', 'activity:story-n3:invitation-scope', 'reading', 'line:terms:repair'),
            line('line:terms:repair', 'ruparna', 'Ruparna sends questions, not a class-wide acceptance.',
                'じゃあ「条件を教えてください」って聞く。みんなの返事を、私が決めない。',
                'では、条件のご提示をお願いしますと伺います。クラス全体の意思を私が代弁することはしません。'),
            choice('choice:terms:reply', 'What belongs in the first reply?', [
                ['option:terms:scope-first', 'Ask for purpose, audience, and approval terms.', '目的と聞く人、確認の条件を聞く。', '目的、対象者、承認条件をご確認する。'],
                ['option:terms:accept-all', 'Accept for everyone so planning can begin.', '準備のため、全員の参加を決める。', '準備のため、全員分の参加を承諾する。'],
            ]),
            line('line:terms:close', 'aakash', 'The invitation stays open, and each person keeps the right to answer it.',
                '返事が遅いんじゃない。選べる返事にしているんだ。',
                '返答を遅らせているのではありません。選べる形の返答に整えています。'),
        ]),
    episode('s3e05-chair-not-reserved', 29, 'The Chair Is Not Reserved', 'academy-library', ['sam', 'xingyu'],
        'A seating draft quietly assigns a learner a public role before they have opted in.',
        'Sam and Xingyu keep the place available without treating availability as agreement.',
        'activity:story-n3:opt-in-seat', 'opt-in-attendance', [
            stage('stage:chair:seating-plan', 'A seating plan shows one name in a front-row chair with a question mark beside it.'),
            line('line:chair:sam', 'sam', 'Sam sees his name in the plan before anyone has asked him.',
                '空けておいてくれたのは分かる。でも、前で話すって決めたことにはならないよ。',
                '席を空けてくださった意図は分かります。ただ、それは前で話すことへの同意とは別です。'),
            line('line:chair:xingyu', 'xingyu', 'Xingyu changes the label before changing the person.',
                'じゃあ、名前じゃなくて「希望者用」にしよう。必要なら、あとで本人に聞く。',
                'では、個人名ではなく「希望者用」と記します。必要な場合に限り、後ほど本人へ確認します。'),
            activity('activity-node:chair:opt-in', 'activity:story-n3:opt-in-seat', 'listening', 'line:chair:repair'),
            line('line:chair:repair', 'sam', 'Sam can see the invitation without being placed inside it.',
                'それなら、考えてから言える。席があることと、約束は別だね。',
                'それなら、考えてから返答できます。席が用意されていることと、約束は別ですね。'),
            choice('choice:chair:label', 'How should the seating plan change?', [
                ['option:chair:hold-open', 'Mark it open and ask the person privately only if needed.', '希望者用にして、必要なら本人に聞く。', '希望者用と明記し、必要な場合に限り本人へ確認する。'],
                ['option:chair:keep-name', 'Keep the name because the chair was meant kindly.', '親切なので、名前はそのままにする。', '善意で用意したため、氏名表記を維持する。'],
            ]),
            line('line:chair:close', 'xingyu', 'The empty chair becomes an option, not a promise made on someone’s behalf.',
                '空いている席は、誰かの返事の代わりにはならない。',
                '空席は、誰かに代わって承諾するものではありません。'),
        ]),
    episode('s3e06-two-schedules', 30, 'Two Schedules, One Promise', 'academy-classroom', ['rie', 'francis'],
        'A draft calendar and the venue calendar disagree, while a public post is waiting for a date.',
        'Rie and Francis promise only the next check-in, preserving the distinction between a proposal and a confirmation.',
        'activity:story-n3:conditional-schedule', 'conditional-commitment', [
            stage('stage:schedules:two-columns', 'Two calendars show different dates. A public post is still marked draft.'),
            line('line:schedules:rie', 'rie', 'Rie catches the familiar wish to make uncertainty disappear with a confident sentence.',
                'こっちの日にしたい。でも、向こうの予定がまだ違うなら、決まったって書けない。',
                'こちらの日程を希望しています。ただ、先方の予定と一致していない以上、確定したとは記載できません。'),
            line('line:schedules:francis', 'francis', 'Francis makes the promise smaller and more reliable.',
                '日付を約束する代わりに、確認する時刻を約束しよう。今日の五時に、というふうに。',
                '日程そのものを約束する代わりに、確認時刻を約束しましょう。たとえば本日17時までに確認するとします。'),
            activity('activity-node:schedules:conditional', 'activity:story-n3:conditional-schedule', 'writing', 'line:schedules:repair'),
            line('line:schedules:repair', 'rie', 'Rie posts a status that is useful without turning a proposal into a fact.',
                '「候補日、確認中。五時までに更新」なら、待つ人にも分かる。',
                '「候補日を確認中。本日17時までに更新」とすれば、お待ちの方にも状況が伝わります。'),
            choice('choice:schedules:post', 'What should the public post say now?', [
                ['option:schedules:mark-pending', 'Name the candidate date and the next confirmation time.', '候補日と、次に確認する時刻を書く。', '候補日および次回確認時刻を明記する。'],
                ['option:schedules:announce-date', 'Announce the preferred date as settled.', '希望の日を決定として出す。', '希望日を確定事項として告知する。'],
            ]),
            line('line:schedules:close', 'francis', 'A clear next check-in gives the promise somewhere honest to stand.',
                '約束は大きくなくていい。守れる場所に置けばいい。',
                '約束は大きくある必要はありません。守れる地点に置けばよいのです。'),
        ]),
]);

export const N3_STORY_EPISODES: readonly StoryEpisode[] = Object.freeze(records.map(record => record.episode));

export function n3StoryArcForEpisode(episodeId: string | undefined): StoryPlayableArc | undefined {
    return records.find(record => record.episode.id === episodeId)?.arc;
}

function episode(
    id: string,
    ordinal: number,
    title: string,
    locationId: string,
    cast: readonly string[],
    storyBeat: string,
    emotionalTurn: string,
    activityId: string,
    mechanic: string,
    nodes: readonly StoryArcNode[],
): N3ArcRecord {
    const sceneId = `scene:${id}`;
    const activityNode = nodes.find(node => node.kind === 'activity')!;
    const scene: StoryArcScene = Object.freeze({
        id: sceneId,
        packageId: id,
        packageTitle: title,
        locationId,
        timeState: 'evening-after-class',
        goal: storyBeat,
        dramaticQuestion: emotionalTurn,
        learnerNeed: mechanic,
        nodes: Object.freeze(nodes),
        exit: Object.freeze({ checkpoint: true, next: null }),
    });
    const activity: StoryActivityBinding = Object.freeze({
        lessonId: 'lesson:story-n3-batch',
        componentType: mechanic,
        exerciseId: activityId,
        registered: true,
        nodeId: activityNode.id,
        sceneId,
        requiredEvidence: Object.freeze({ kind: 'activity-passed', activityId }),
    });
    const byScene = new Map([[sceneId, scene]]);
    return Object.freeze({
        episode: Object.freeze({
            id,
            ordinal,
            curriculum: Object.freeze({ stage: 'n3', milestone: mechanic }),
            title,
            location: Object.freeze({ id: locationId, label: locationId === 'academy-classroom' ? 'Academy classroom' : 'Academy library' }),
            storyBeat,
            emotionalTurn,
            curriculumHooks: Object.freeze([`original N3 batch: ${activityId}`]),
            minigame: Object.freeze({ id: `practice:${id}`, mechanic: 'deterministic interpretation', prompt: mechanic, success: 'The scene resumes from recorded evidence.' }),
            cast: Object.freeze([...cast]),
            unlocks: Object.freeze([]),
            replayVariants: Object.freeze([{ id: `replay:${id}:n2`, label: 'N2 reread', changes: 'Retains the canonical fact with denser register and inference.' }]),
            eventArt: Object.freeze({ id: `art:${id}`, brief: 'VN stage uses an established Academy interior.', safety: 'No unapproved likeness or external dialogue.' }),
            sourceSafety: Object.freeze({ fictionalComposite: true, realEventClaim: false, note: 'Original Yomu N3 story content.' }),
        }),
        arc: Object.freeze({
            id: `arc:${id}`,
            episodeId: id,
            title,
            scenes: Object.freeze([scene]),
            firstSceneId: sceneId,
            lastSceneId: sceneId,
            curriculum: Object.freeze({ activities: Object.freeze([activity]) }),
            replay: Object.freeze({ canonicalWrites: false, chronologicalMemory: true }),
            scene: (candidate: string | undefined) => candidate ? byScene.get(candidate) : undefined,
            nextScene: () => undefined,
        }),
    });
}

function stage(id: string, description: string): StoryArcNode {
    return Object.freeze({ kind: 'stage', id, description });
}

function line(id: string, speakerId: string, intent: string, n3: string, n2: string): StoryArcNode {
    return Object.freeze({
        kind: 'line', id, speakerId, intent,
        variants: Object.freeze({
            n3: Object.freeze({ japanese: n3, reading: '', english: intent }),
            n2: Object.freeze({ japanese: n2, reading: '', english: intent }),
        }),
    });
}

function activity(id: string, exerciseId: string, componentType: string, onReady: string): StoryArcNode {
    return Object.freeze({
        kind: 'activity', id,
        hook: Object.freeze({ lessonId: 'lesson:story-n3-batch', componentType, exerciseId }),
        requiredEvidence: Object.freeze({ kind: 'activity-passed', activityId: exerciseId }),
        resumeContext: 'Use the mapped N3 practice, then return to the exact scene.',
        onReady,
    });
}

function choice(
    id: string,
    question: string,
    options: readonly (readonly [string, string, string, string])[],
): StoryArcNode {
    return Object.freeze({
        kind: 'choice', id, question,
        options: Object.freeze(options.map(([optionId, action, n3, n2]) => Object.freeze({
            id: optionId, action,
            japaneseByBand: Object.freeze({ n3, n2 }),
            records: Object.freeze([]), next: id.replace('choice', 'line').replace(/:[^:]+$/, ':close'),
        }))),
    });
}
